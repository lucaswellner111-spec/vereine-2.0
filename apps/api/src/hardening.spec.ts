import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { handleSchema } from "@vereine/shared";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { DB } from "./db/db.module";
import * as schema from "./db/schema";

const password = "ein-sehr-langes-passwort";

/** Haertung (Paket P1): Eingaben, Wettlaeufe, reservierte Namen, Nutzungslimits, Kommentare loeschen, Mitgliedernamen. */
describe("Haertung", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, "..", "drizzle") });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  type U = { cookie: string; id: string; name: string };
  async function signup(name: string, displayName = name): Promise<U> {
    const email = `${name}@example.de`;
    const reg = await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email, password, displayName, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: reg.json().id, name: displayName };
  }
  const req = (u: U, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });

  let vera: U, mo: U, mia: U, ben: U, pia: U, nina: U;
  const org = "haerte-verein";

  beforeAll(async () => {
    [vera, mo, mia, ben, pia, nina] = [await signup("vera"), await signup("mo"), await signup("mia"), await signup("ben"), await signup("pia"), await signup("nina")];
    await req(vera, "POST", "/orgs", { name: "Haerte Verein", category: "Sport", city: "Hartstadt" });
    for (const m of [mo, mia, ben]) {
      await req(m, "POST", `/orgs/${org}/membership`);
      await req(vera, "POST", `/orgs/${org}/members/${m.id}/decision`, { decision: "approve" });
    }
    await req(vera, "PUT", `/orgs/${org}/members/${mo.id}/role`, { role: "moderator" });
    await req(pia, "POST", `/orgs/${org}/membership`); // bleibt offen
  });

  it("kaputte Cursor -> 400 statt 500", async () => {
    expect((await req(mia, "GET", "/feed?cursor=kaputt")).statusCode).toBe(400);
    expect((await req(mia, "GET", `/orgs/${org}/posts?cursor=%27%3Bdrop`)).statusCode).toBe(400);
    const dm = (await req(mia, "POST", "/chat/conversations", { kind: "direct", userId: ben.id })).json();
    expect((await req(mia, "GET", `/chat/conversations/${dm.id}/messages?cursor=kaputt`)).statusCode).toBe(400);
  });

  it("unmoegliche Kalenderdaten -> 400", async () => {
    const inv = await req(vera, "POST", `/orgs/${org}/invoices`, {
      recipientUserId: mia.id, dueDate: "2026-02-31", items: [{ description: "Beitrag", quantity: 1, unitCents: 100, vatRate: 0 }],
    });
    expect(inv.statusCode).toBe(400);
    expect((await req(vera, "PUT", `/orgs/${org}/member-registry/${mia.id}`, { joinedOn: "2026-02-30" })).statusCode).toBe(400);
    expect((await req(vera, "PUT", `/orgs/${org}/member-registry/${mia.id}`, { joinedOn: "2026-02-28" })).statusCode).toBe(200);
  });

  it("Wettlaeufe: parallele Likes, Direktchats und Vereinsgruendungen ohne 500", async () => {
    const post = (await req(mia, "POST", "/posts", { body: "Parallel-Test" })).json();
    const likes = await Promise.all([1, 2, 3, 4, 5].map(() => req(ben, "POST", `/posts/${post.id}/like`)));
    expect(likes.every((r) => r.statusCode === 201 || r.statusCode === 200)).toBe(true);
    expect((await db.select().from(schema.postLikes).where(eq(schema.postLikes.postId, post.id))).length).toBeLessThanOrEqual(1);

    const [a, b] = await Promise.all([
      req(mo, "POST", "/chat/conversations", { kind: "direct", userId: ben.id }),
      req(ben, "POST", "/chat/conversations", { kind: "direct", userId: mo.id }),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(a.json().id).toBe(b.json().id);

    const orgs = await Promise.all([1, 2].map(() => req(nina, "POST", "/orgs", { name: "Parallel", category: "Sport", city: "Gleichzeit" })));
    expect(orgs.map((r) => r.statusCode)).toEqual([201, 201]);
    expect(new Set(orgs.map((r) => r.json().slug)).size).toBe(2);
  });

  it("reservierte Vereinsadressen und Handles werden umgangen", async () => {
    expect((await req(nina, "POST", "/orgs", { name: "Mine", category: "Sport", city: "Stadt" })).json().slug).toBe("mine-2");
    const admin = await signup("chef", "Admin");
    const handle = (await req(admin, "GET", "/profiles/me")).json().handle;
    expect(handle).not.toBe("admin");
    expect(handleSchema.safeParse(handle).success).toBe(true);
  });

  it("private Profile zeigen Fremden weder Bio noch Ort", async () => {
    const zoe = await signup("zoe");
    await req(zoe, "PUT", "/profiles/me", { bio: "Geheime Bio", location: "Geheimstadt", visibility: "private" });
    const handle = (await req(zoe, "GET", "/profiles/me")).json().handle;
    const view = (await req(nina, "GET", `/profiles/${handle}`)).json();
    expect(view.viewer.canView).toBe(false);
    expect(view.bio).toBe("");
    expect(view.location).toBe("");
    expect((await req(zoe, "GET", `/profiles/${handle}`)).json().bio).toBe("Geheime Bio");
  });

  it("DELETE /comments/:id: eigener Kommentar oder Kommentar unter eigenem persoenlichen Beitrag", async () => {
    const own = (await req(mia, "POST", "/posts", { body: "Mein Beitrag" })).json();
    const c1 = (await req(ben, "POST", `/posts/${own.id}/comments`, { body: "Kommentar 1" })).json();
    const c2 = (await req(ben, "POST", `/posts/${own.id}/comments`, { body: "Kommentar 2" })).json();
    expect((await req(ben, "DELETE", "/comments/kein-uuid")).statusCode).toBe(400);
    expect((await req(ben, "DELETE", "/comments/00000000-0000-4000-8000-000000000000")).statusCode).toBe(404);
    expect((await req(nina, "DELETE", `/comments/${c1.id}`)).statusCode).toBe(403);
    expect((await req(mia, "DELETE", `/comments/${c1.id}`)).statusCode).toBe(204); // Autorin des Beitrags
    expect((await req(ben, "DELETE", `/comments/${c2.id}`)).statusCode).toBe(204); // eigener Kommentar
    expect(await db.select().from(schema.comments).where(eq(schema.comments.postId, own.id))).toHaveLength(0);

    // Vereinsbeitrag: Autorin darf fremde Kommentare hier nicht loeschen (dafuer gibt es die Moderation)
    const orgPost = (await req(vera, "POST", "/posts", { body: "Vereinsnews", orgSlug: org })).json();
    const c3 = (await req(ben, "POST", `/posts/${orgPost.id}/comments`, { body: "Kommentar 3" })).json();
    expect((await req(vera, "DELETE", `/comments/${c3.id}`)).statusCode).toBe(403);
    // ausgeblendeter Beitrag: eigener Kommentar bleibt loeschbar
    expect((await req(mo, "POST", `/posts/${orgPost.id}/moderation`, { action: "hide", reason: "Verstoss gegen die Regeln des Vereins" })).statusCode).toBe(204);
    expect((await req(ben, "DELETE", `/comments/${c3.id}`)).statusCode).toBe(204);
  });

  it("doppelte offene Meldung erzeugt keine zweite Zeile", async () => {
    const post = (await req(vera, "POST", "/posts", { body: "Meldbar", orgSlug: org })).json();
    expect((await req(ben, "POST", `/posts/${post.id}/report`, { reason: "spam" })).statusCode).toBe(204);
    expect((await req(ben, "POST", `/posts/${post.id}/report`, { reason: "hate" })).statusCode).toBe(204);
    expect(await db.select().from(schema.reports).where(eq(schema.reports.postId, post.id))).toHaveLength(1);
  });

  it("Mitgliedernamen: nur Vorstand/Moderation, nur aktive, ohne Rollen und E-Mails", async () => {
    const res = await req(mo, "GET", `/orgs/${org}/member-names`);
    expect(res.statusCode).toBe(200);
    const list = res.json() as { userId: string; name: string }[];
    expect(list.map((m) => m.name)).toEqual(["ben", "mia", "mo", "vera"]); // pia (offen) fehlt
    expect(list.every((m) => Object.keys(m).sort().join() === "name,userId")).toBe(true);
    expect(res.body).not.toMatch(/@example\.de|admin|moderator/);
    expect((await req(vera, "GET", `/orgs/${org}/member-names`)).statusCode).toBe(200);
    expect((await req(mia, "GET", `/orgs/${org}/member-names`)).statusCode).toBe(403);
    expect((await req(nina, "GET", `/orgs/${org}/member-names`)).statusCode).toBe(403);
  });

  it("Chat-Detail entspricht der Zusammenfassung aus der Liste", async () => {
    const dm = (await req(mia, "POST", "/chat/conversations", { kind: "direct", userId: ben.id })).json();
    await req(ben, "POST", `/chat/conversations/${dm.id}/messages`, { body: "Hallo" });
    const fromList = (await req(mia, "GET", "/chat/conversations")).json().find((c: { id: string }) => c.id === dm.id);
    const detail = (await req(mia, "GET", `/chat/conversations/${dm.id}`)).json();
    expect(detail).toMatchObject(fromList);
  });

  it("Nutzungslimits: 11. Verein am Tag und 4. Antrag nach 3 Ablehnungen -> 429", async () => {
    const gr = await signup("gruender");
    for (let i = 1; i <= 10; i++) {
      expect((await req(gr, "POST", "/orgs", { name: `Limit Verein ${i}`, category: "Sport", city: "Limitstadt" })).statusCode).toBe(201);
    }
    const eleventh = await req(gr, "POST", "/orgs", { name: "Limit Verein 11", category: "Sport", city: "Limitstadt" });
    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json().message).toMatch(/^Du hast das Limit für .* erreicht\. Bitte versuche es später erneut\.$/);

    const rex = await signup("rex");
    for (let i = 0; i < 3; i++) {
      expect((await req(rex, "POST", `/orgs/${org}/membership`)).statusCode).toBe(201);
      expect((await req(vera, "POST", `/orgs/${org}/members/${rex.id}/decision`, { decision: "reject" })).statusCode).toBe(204);
    }
    expect((await req(rex, "POST", `/orgs/${org}/membership`)).statusCode).toBe(429);
  });
});
