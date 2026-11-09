import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { AuthService } from "../auth/auth.service";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { createTestDb } from "../testing/test-db";
import { StorageService } from "../media/storage.service";

const password = "ein-sehr-langes-passwort";
const png = (w = 400, h = 300) => sharp({ create: { width: w, height: h, channels: 3, background: "#3a7d44" } }).png().toBuffer();

/** P4a: Beitrags-Detail, Bearbeiten, Kommentare melden, Vereinsprofil mit Logo/Banner, "Nachricht schreiben". */
describe("P4a: Beitraege, Kommentarmeldungen, Vereinsseite", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let storage: StorageService;
  const dir = mkdtempSync(join(tmpdir(), "vereine-p4a-"));

  beforeAll(async () => {
    process.env.MEDIA_DIR = dir;
    db = await createTestDb();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    storage = app.get(StorageService);
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.MEDIA_DIR;
  });

  type U = { cookie: string; id: string; email: string };
  async function signup(name: string): Promise<U> {
    const email = `${name}@example.de`;
    const reg = await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: reg.json().id, email };
  }
  const req = (u: U, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });
  const upload = (u: U, url: string, data: Buffer, type = "image/png") => {
    const boundary = "----p4a" + Math.random().toString(16).slice(2);
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: ${type}\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({ method: "POST", url, payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}`, cookie: u.cookie } });
  };
  const join2 = async (slug: string, admin: U, m: U) => {
    await req(m, "POST", `/orgs/${slug}/membership`);
    await req(admin, "POST", `/orgs/${slug}/members/${m.id}/decision`, { decision: "approve" });
  };

  // vera: Vorstand, mo: Moderation, mia: Mitglied, tom: Aussenstehender
  let vera: U, mo: U, mia: U, tom: U;
  const slug = "tsv-p4a";

  beforeAll(async () => {
    [vera, mo, mia, tom] = [await signup("vera"), await signup("mo"), await signup("mia"), await signup("tom")];
    expect((await req(vera, "POST", "/orgs", { name: "TSV P4a", category: "Sport", city: "Musterstadt" })).statusCode).toBe(201);
    await join2(slug, vera, mo);
    await join2(slug, vera, mia);
    await req(vera, "PUT", `/orgs/${slug}/members/${mo.id}/role`, { role: "moderator" });
  });

  describe("GET/PATCH /posts/:id", () => {
    it("Detail: sichtbar nach Regeln, 404 bei geloescht/ausgeblendet/privat ohne Folgen; canEdit nur fuer den Autor", async () => {
      const own = (await req(mia, "POST", "/posts", { body: "Mein Beitrag" })).json();
      expect(own.canEdit).toBe(true);
      expect(own.editedAt).toBeNull();
      const seen = await req(tom, "GET", `/posts/${own.id}`);
      expect(seen.statusCode).toBe(200);
      expect(seen.json()).toMatchObject({ id: own.id, body: "Mein Beitrag", canEdit: false });

      const club = (await req(vera, "POST", "/posts", { body: "Vereinsnews", orgSlug: slug })).json();
      expect(club.canEdit).toBe(true);
      expect((await req(tom, "GET", `/posts/${club.id}`)).json()).toMatchObject({ org: { slug }, canEdit: false });

      // privat ohne Folgen
      await req(mia, "PUT", "/profiles/me", { visibility: "private" });
      expect((await req(tom, "GET", `/posts/${own.id}`)).statusCode).toBe(404);
      expect((await req(mia, "GET", `/posts/${own.id}`)).statusCode).toBe(200);
      await req(mia, "PUT", "/profiles/me", { visibility: "public" });
      // ausgeblendet / geloescht
      await db.update(schema.posts).set({ hiddenAt: new Date(), hiddenReason: "Test" }).where(eq(schema.posts.id, club.id));
      expect((await req(tom, "GET", `/posts/${club.id}`)).statusCode).toBe(404);
      expect((await req(mia, "DELETE", `/posts/${own.id}`)).statusCode).toBe(204);
      expect((await req(mia, "GET", `/posts/${own.id}`)).statusCode).toBe(404);
      expect((await req(mia, "GET", "/posts/not-a-uuid")).statusCode).toBe(400);
    });

    it("Bearbeiten: nur Autor (bei Verein mit Rolle), Text oder Bild, gesperrt bei offener Meldung, setzt editedAt", async () => {
      const p = (await req(mia, "POST", "/posts", { body: "Erstfassung", tags: ["fussball"] })).json();
      expect((await req(tom, "PATCH", `/posts/${p.id}`, { body: "fremd" })).statusCode).toBe(403);
      expect((await req(mia, "PATCH", `/posts/${p.id}`, { body: "" })).statusCode).toBe(400); // leer ohne Bild
      expect((await req(mia, "PATCH", `/posts/${p.id}`, { body: "x", tags: ["gibt-es-nicht"] })).statusCode).toBe(400); // Tag-Katalog
      expect((await req(mia, "PATCH", `/posts/${p.id}`, { body: "x".repeat(1001) })).statusCode).toBe(400);
      const ok = await req(mia, "PATCH", `/posts/${p.id}`, { body: "Zweitfassung", tags: ["handball", "handball"] });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toMatchObject({ body: "Zweitfassung", tags: ["handball"], canEdit: true });
      expect(ok.json().editedAt).toEqual(expect.any(String));
      expect((await req(tom, "GET", `/posts/${p.id}`)).json().editedAt).toEqual(ok.json().editedAt);

      // Bildbeitrag darf leeren Text bekommen; Bilder bleiben
      const img = (await upload(mia, "/media/post", await png())).json();
      const withImg = (await req(mia, "POST", "/posts", { body: "Mit Bild", mediaIds: [img.id] })).json();
      const cleared = await req(mia, "PATCH", `/posts/${withImg.id}`, { body: "" });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().media.map((m: { id: string }) => m.id)).toEqual([img.id]);

      // offene Meldung -> 409, nach Erledigung wieder frei
      await req(tom, "POST", `/posts/${p.id}/report`, { reason: "spam" });
      expect((await req(mia, "PATCH", `/posts/${p.id}`, { body: "Vertuschen" })).statusCode).toBe(409);
      await db.update(schema.reports).set({ status: "dismissed" }).where(eq(schema.reports.postId, p.id));
      expect((await req(mia, "PATCH", `/posts/${p.id}`, { body: "Dritte Fassung" })).statusCode).toBe(200);
    });

    it("Vereinsbeitrag: Autor ohne Rolle 403, fremder Vorstand 403", async () => {
      const p = (await req(mo, "POST", "/posts", { body: "Von der Moderation", orgSlug: slug })).json();
      expect((await req(vera, "PATCH", `/posts/${p.id}`, { body: "Vorstand aendert fremden Text" })).statusCode).toBe(403);
      expect((await req(mo, "PATCH", `/posts/${p.id}`, { body: "Moderation aendert eigenen Text" })).statusCode).toBe(200);
      await req(vera, "PUT", `/orgs/${slug}/members/${mo.id}/role`, { role: "member" });
      expect((await req(mo, "GET", `/posts/${p.id}`)).json().canEdit).toBe(false);
      expect((await req(mo, "PATCH", `/posts/${p.id}`, { body: "ohne Rolle" })).statusCode).toBe(403);
      await req(vera, "PUT", `/orgs/${slug}/members/${mo.id}/role`, { role: "moderator" });
    });
  });

  describe("Kommentare melden", () => {
    it("doppelt = eine Zeile, Beitrag+Kommentar derselben Person moeglich, eigener 400, Vereins-Queue, hide loescht, Kaskade", async () => {
      const p = (await req(vera, "POST", "/posts", { body: "Diskussion", orgSlug: slug })).json();
      const c = (await req(mia, "POST", `/posts/${p.id}/comments`, { body: "Boeser Kommentar" })).json();
      expect((await req(mia, "POST", `/comments/${c.id}/report`, { reason: "spam" })).statusCode).toBe(400); // eigener
      expect((await req(tom, "POST", `/comments/${c.id}/report`, { reason: "nope" })).statusCode).toBe(400); // Validierung
      expect((await req(tom, "POST", `/comments/${c.id}/report`, { reason: "hate", note: "beleidigend" })).statusCode).toBe(204);
      expect((await req(tom, "POST", `/comments/${c.id}/report`, { reason: "hate" })).statusCode).toBe(204); // doppelt
      expect((await req(tom, "POST", `/posts/${p.id}/report`, { reason: "spam" })).statusCode).toBe(204); // Beitrag derselben Person
      const rows = await db.select().from(schema.reports).where(and(eq(schema.reports.postId, p.id), eq(schema.reports.status, "open")));
      expect(rows.filter((r) => r.commentId === c.id)).toHaveLength(1);
      expect(rows.filter((r) => r.commentId === null)).toHaveLength(1);
      expect((await req(tom, "POST", "/comments/00000000-0000-0000-0000-000000000000/report", { reason: "spam" })).statusCode).toBe(404);

      const queue = (await req(mo, "GET", `/orgs/${slug}/reports`)).json() as { id: string; comment: { id: string; body: string; authorName: string } | null }[];
      const item = queue.find((r) => r.comment?.id === c.id)!;
      expect(item.comment).toEqual({ id: c.id, body: "Boeser Kommentar", authorName: "mia", authorHandle: "mia" });
      expect(queue.find((r) => r.comment === null && r.id !== item.id)).toBeTruthy();

      expect((await req(mo, "POST", `/reports/${item.id}/resolve`, { action: "hide", reason: "Beleidigung entfernt" })).statusCode).toBe(204);
      expect(await db.select().from(schema.comments).where(eq(schema.comments.id, c.id))).toHaveLength(0);
      expect(await db.select().from(schema.reports).where(eq(schema.reports.commentId, c.id))).toHaveLength(0); // Kaskade
      const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "comment.deleted"));
      expect(audit.some((a) => (a.meta as { reportId?: string }).reportId === item.id)).toBe(true);
      // Beitrag selbst bleibt sichtbar, seine Meldung offen
      expect((await req(tom, "GET", `/posts/${p.id}`)).statusCode).toBe(200);
    });

    it("Kommentar unter persoenlichem Beitrag landet in der Plattform-Queue; unsichtbarer Beitrag 404", async () => {
      const p = (await req(mia, "POST", "/posts", { body: "Privatsache" })).json();
      const c = (await req(mo, "POST", `/posts/${p.id}/comments`, { body: "Spam!" })).json();
      expect((await req(tom, "POST", `/comments/${c.id}/report`, { reason: "spam" })).statusCode).toBe(204);
      const [r] = await db.select().from(schema.reports).where(eq(schema.reports.commentId, c.id));
      expect(r.orgId).toBeNull();
      await req(mia, "PUT", "/profiles/me", { visibility: "private" });
      const c2 = (await req(mia, "POST", `/posts/${p.id}/comments`, { body: "eigener" })).json();
      expect((await req(tom, "POST", `/comments/${c2.id}/report`, { reason: "spam" })).statusCode).toBe(404);
      await req(mia, "PUT", "/profiles/me", { visibility: "public" });
      await app.get(AuthService).setPlatformAdmin(vera.email, true);
      const queue = (await req(vera, "GET", "/platform/reports")).json() as { comment: { id: string } | null }[];
      expect(queue.some((q) => q.comment?.id === c.id)).toBe(true);
      await app.get(AuthService).setPlatformAdmin(vera.email, false);
    });
  });

  describe("Vereinsprofil", () => {
    it("PUT /orgs/:slug: nur Vorstand, Slug bleibt, Validierung", async () => {
      const body = { name: "TSV P4a Neu", category: "Kultur", city: "Neustadt", about: "Wir sind ein Verein." };
      expect((await req(mo, "PUT", `/orgs/${slug}`, body)).statusCode).toBe(403);
      expect((await req(tom, "PUT", `/orgs/${slug}`, body)).statusCode).toBe(403);
      expect((await req(vera, "PUT", `/orgs/${slug}`, { ...body, category: "Quatsch" })).statusCode).toBe(400);
      expect((await req(vera, "PUT", `/orgs/${slug}`, { ...body, name: "ab" })).statusCode).toBe(400);
      expect((await req(vera, "PUT", `/orgs/${slug}`, { ...body, about: "x".repeat(601) })).statusCode).toBe(400);
      const ok = await req(vera, "PUT", `/orgs/${slug}`, { ...body, slug: "anderer-slug" });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toMatchObject({ slug, name: "TSV P4a Neu", category: "Kultur", city: "Neustadt", about: "Wir sind ein Verein." });
      expect((await req(tom, "GET", "/orgs/anderer-slug")).statusCode).toBe(404);
    });

    it("Logo/Banner: nur Vorstand, Typpruefung, Varianten, Ersetzen loescht alte Datei, alle Angemeldeten sehen es", async () => {
      expect((await upload(mo, `/media/org/${slug}/logo`, await png())).statusCode).toBe(403);
      expect((await upload(vera, `/media/org/${slug}/logo`, Buffer.from("kein bild"), "image/png")).statusCode).toBe(400);
      expect((await upload(vera, `/media/org/${slug}/wappen`, await png())).statusCode).toBe(404);
      const first = (await upload(vera, `/media/org/${slug}/logo`, await png())).json();
      expect(first).toMatchObject({ width: 256, height: 256 });
      const banner = await upload(vera, `/media/org/${slug}/banner`, await png(2000, 900));
      expect(banner.json()).toMatchObject({ width: 1500, height: 500 });
      const detail = (await req(tom, "GET", `/orgs/${slug}`)).json();
      expect(detail).toMatchObject({ logoId: first.id, bannerId: banner.json().id });
      expect(((await req(tom, "GET", "/orgs")).json() as { slug: string; logoId: string }[]).find((o) => o.slug === slug)?.logoId).toBe(first.id);
      for (const v of ["logo", "logo-sm"]) expect((await req(tom, "GET", `/media/${first.id}/${v}`)).statusCode).toBe(200);
      expect((await req(tom, "GET", `/media/${banner.json().id}/banner-sm`)).statusCode).toBe(200);
      const [row] = await db.select().from(schema.media).where(eq(schema.media.id, first.id));
      expect(row).toMatchObject({ ownerId: null, kind: "org_logo" });

      const second = (await upload(vera, `/media/org/${slug}/logo`, await png())).json();
      expect(await storage.get(`${first.id}/logo.webp`)).toBeNull();
      expect(await db.select().from(schema.media).where(eq(schema.media.id, first.id))).toHaveLength(0);
      expect((await req(tom, "GET", `/orgs/${slug}`)).json().logoId).toBe(second.id);
      // Vereinsbeitraege tragen das Logo mit
      const feedPosts = (await req(tom, "GET", `/orgs/${slug}/posts`)).json().posts as { org: { logoId: string | null } }[];
      expect(feedPosts[0].org.logoId).toBe(second.id);

      // Ersetzen schlaegt in der Transaktion fehl: altes Logo bleibt, das frisch gespeicherte Bild wird wieder entfernt
      const before = await db.select({ id: schema.media.id }).from(schema.media).where(eq(schema.media.kind, "org_logo"));
      const spy = vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("DB weg"));
      expect((await upload(vera, `/media/org/${slug}/logo`, await png())).statusCode).toBe(500);
      spy.mockRestore();
      const after = await db.select({ id: schema.media.id }).from(schema.media).where(eq(schema.media.kind, "org_logo"));
      expect(after.map((m) => m.id).sort()).toEqual(before.map((m) => m.id).sort());
      expect((await req(tom, "GET", `/orgs/${slug}`)).json().logoId).toBe(second.id);
      expect(await storage.get(`${second.id}/logo.webp`)).not.toBeNull();

      expect((await req(mo, "DELETE", `/media/org/${slug}/banner`)).statusCode).toBe(403);
      expect((await req(vera, "DELETE", `/media/org/${slug}/banner`)).statusCode).toBe(204);
      expect((await req(tom, "GET", `/orgs/${slug}`)).json().bannerId).toBeNull();
      expect(await storage.get(`${banner.json().id}/banner.webp`)).toBeNull();
    });

    it("Kontoloeschung des Vorstands behaelt das Logo, Vereinsloeschung entfernt es", async () => {
      const [a, b] = [await signup("anke"), await signup("bert")];
      await req(a, "POST", "/orgs", { name: "Logo Verein", category: "Sport", city: "Bildstadt" });
      const s = "logo-verein";
      await join2(s, a, b);
      await req(a, "PUT", `/orgs/${s}/members/${b.id}/role`, { role: "admin" });
      const logo = (await upload(a, `/media/org/${s}/logo`, await png())).json();
      expect((await req(a, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);
      expect((await req(b, "GET", `/orgs/${s}`)).json().logoId).toBe(logo.id);
      expect(await storage.get(`${logo.id}/logo.webp`)).not.toBeNull();

      // b ist jetzt einziges Mitglied: Konto loeschen loescht den Verein samt Logo
      expect((await req(b, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);
      expect(await db.select().from(schema.organizations).where(eq(schema.organizations.slug, s))).toHaveLength(0);
      expect(await db.select().from(schema.media).where(eq(schema.media.id, logo.id))).toHaveLength(0);
      expect(await storage.get(`${logo.id}/logo.webp`)).toBeNull();
    });

    it("Antrag zurueckziehen (pending, selbst)", async () => {
      const kai = await signup("kai");
      await req(kai, "POST", `/orgs/${slug}/membership`);
      expect((await req(kai, "GET", `/orgs/${slug}`)).json().viewer.membership).toBe("pending");
      expect((await req(kai, "DELETE", `/orgs/${slug}/members/${kai.id}`)).statusCode).toBe(204);
      expect((await req(kai, "GET", `/orgs/${slug}`)).json().viewer.membership).toBe("none");
    });
  });

  it("canMessage: gemeinsamer Verein ja, Fremde nein, nie bei sich selbst", async () => {
    const handle = async (u: U) => (await req(u, "GET", "/profiles/me")).json().handle as string;
    const [miaHandle, tomHandle, veraHandle] = [await handle(mia), await handle(tom), await handle(vera)];
    expect((await req(vera, "GET", `/profiles/${miaHandle}`)).json().viewer.canMessage).toBe(true);
    expect((await req(mia, "GET", `/profiles/${tomHandle}`)).json().viewer.canMessage).toBe(false);
    expect((await req(tom, "GET", `/profiles/${miaHandle}`)).json().viewer.canMessage).toBe(false);
    expect((await req(mia, "GET", "/profiles/me")).json().viewer.canMessage).toBe(false);
    // Follower des Vereins darf dem Vorstand schreiben
    await req(tom, "POST", `/orgs/${slug}/follow`);
    expect((await req(tom, "GET", `/profiles/${veraHandle}`)).json().viewer.canMessage).toBe(true);
    // Blockierung in beide Richtungen: kein Knopf
    expect((await req(mia, "PUT", `/chat/blocks/${vera.id}`)).statusCode).toBe(204);
    expect((await req(vera, "GET", `/profiles/${miaHandle}`)).json().viewer.canMessage).toBe(false); // blockiert worden
    const miaView = (await req(mia, "GET", `/profiles/${veraHandle}`)).json();
    expect(miaView.viewer.canMessage).toBe(false); // selbst blockiert
    expect((await req(mia, "DELETE", `/chat/blocks/${vera.id}`)).statusCode).toBe(204);
    expect((await req(vera, "GET", `/profiles/${miaHandle}`)).json().viewer.canMessage).toBe(true);
  });
});
