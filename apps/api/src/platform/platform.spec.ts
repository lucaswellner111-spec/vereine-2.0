import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { AuthService } from "../auth/auth.service";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";

const password = "ein-sehr-langes-passwort";

describe("Plattform-Moderation", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let auth: AuthService;

  beforeAll(async () => {
    db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    auth = app.get(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  type U = { cookie: string; id: string };
  async function signup(name: string): Promise<U> {
    const email = `${name}@example.de`;
    const reg = await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: reg.json().id };
  }
  const req = (u: U, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });

  let root: U, vera: U, mia: U, ben: U, tom: U;

  beforeAll(async () => {
    [root, vera, mia, ben, tom] = [await signup("root"), await signup("vera"), await signup("mia"), await signup("ben"), await signup("tom")];
    await req(vera, "POST", "/orgs", { name: "Plattform Verein", category: "Sport", city: "Pstadt" });
    for (const m of [mia, ben]) {
      await req(m, "POST", "/orgs/plattform-verein/membership");
      await req(vera, "POST", `/orgs/plattform-verein/members/${m.id}/decision`, { decision: "approve" });
    }
  });

  it("Zugang: anonym 401, normaler Nutzer 403, Rolle nur per CLI-Dienst", async () => {
    expect((await app.inject({ method: "GET", url: "/platform/reports" })).statusCode).toBe(401);
    expect((await req(vera, "GET", "/platform/reports")).statusCode).toBe(403);
    expect((await req(vera, "GET", "/platform/chat-reports")).statusCode).toBe(403);
    expect((await req(root, "GET", "/auth/me")).json().isPlatformAdmin).toBe(false);

    expect(await auth.setPlatformAdmin("gibt-es@example.de", true)).toBe(false);
    expect(await auth.setPlatformAdmin("ROOT@example.de", true)).toBe(true); // E-Mail ohne Beachtung der Gross-/Kleinschreibung
    // wirkt sofort (Session-Cache wird verworfen)
    expect((await req(root, "GET", "/auth/me")).json().isPlatformAdmin).toBe(true);
    expect((await req(root, "GET", "/platform/reports")).statusCode).toBe(200);
    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "platform.admin.granted"));
    expect(audit).toHaveLength(1);
  });

  let privatePostId: string;

  it("Persoenliche Beitraege (ohne Verein): Meldung -> Plattform-Warteschlange -> Ausblenden mit Begruendung", async () => {
    privatePostId = (await req(mia, "POST", "/posts", { body: "Beleidigender persoenlicher Beitrag" })).json().id;
    await req(tom, "POST", "/orgs/plattform-verein/follow");
    // Beitrag ist fuer tom sichtbar? (persoenliche Beitraege sind nur im eigenen Feed sichtbar) -> ben meldet ueber die API direkt
    expect((await req(ben, "POST", `/posts/${privatePostId}/report`, { reason: "hate" })).statusCode).toBe(204);

    // Vereins-Meldung gehoert NICHT in die Plattform-Warteschlange
    const orgPost = (await req(vera, "POST", "/posts", { body: "Vereinsbeitrag", orgSlug: "plattform-verein" })).json();
    await req(ben, "POST", `/posts/${orgPost.id}/report`, { reason: "spam" });

    const queue = (await req(root, "GET", "/platform/reports")).json();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ reason: "hate", post: { body: "Beleidigender persoenlicher Beitrag", authorName: "mia" } });

    expect((await req(root, "POST", `/platform/reports/${queue[0].id}/resolve`, { action: "hide", reason: "zu kurz" })).statusCode).toBe(400);
    expect((await req(vera, "POST", `/platform/reports/${queue[0].id}/resolve`, { action: "dismiss" })).statusCode).toBe(403);
    expect((await req(root, "POST", `/platform/reports/${queue[0].id}/resolve`, { action: "hide", reason: "Beleidigung ist nicht erlaubt." })).statusCode).toBe(204);

    expect((await req(root, "GET", "/platform/reports")).json()).toHaveLength(0);
    expect((await req(root, "GET", "/platform/reports?status=actioned")).json()).toHaveLength(1);
    const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, privatePostId));
    expect(post.hiddenAt).not.toBeNull();
    const notes = (await req(mia, "GET", "/notifications")).json().items as { type: string; data: { reason: string } }[];
    expect(notes.find((n) => n.type === "post_hidden")?.data.reason).toBe("Beleidigung ist nicht erlaubt.");

    // Vereins-Meldung kann die Plattform nicht ueber diesen Weg bearbeiten
    const [orgReport] = await db.select().from(schema.reports).where(eq(schema.reports.reason, "spam"));
    expect((await req(root, "POST", `/platform/reports/${orgReport.id}/resolve`, { action: "dismiss" })).statusCode).toBe(403);
  });

  let dm: string;
  let badMessage: string;

  it("Chat-Meldungen: nur die gemeldete Nachricht im Klartext, Zugriff wird protokolliert", async () => {
    dm = (await req(mia, "POST", "/chat/conversations", { kind: "direct", userId: ben.id })).json().id;
    await req(ben, "POST", `/chat/conversations/${dm}/messages`, { body: "Harmlose Nachricht davor" });
    badMessage = (await req(ben, "POST", `/chat/conversations/${dm}/messages`, { body: "Du bist ein Idiot" })).json().id;
    await req(ben, "POST", `/chat/conversations/${dm}/messages`, { body: "Harmlose Nachricht danach" });
    expect((await req(mia, "POST", `/chat/messages/${badMessage}/report`, { reason: "hate", note: "Beleidigung" })).statusCode).toBe(204);

    expect((await req(vera, "GET", "/platform/chat-reports")).statusCode).toBe(403);
    const list = (await req(root, "GET", "/platform/chat-reports")).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reason: "hate", note: "Beleidigung", reporterName: "mia", senderName: "ben", conversationKind: "direct", text: "Du bist ein Idiot" });
    expect(JSON.stringify(list)).not.toMatch(/Harmlose/); // kein Verlauf

    const viewed = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "platform.chat-reports.viewed"));
    expect(viewed).toHaveLength(1);
    expect(viewed[0].userId).toBe(root.id);
    expect((viewed[0].meta as { reportIds: string[] }).reportIds).toEqual([list[0].id]);
  });

  it("Chat-Meldung bearbeiten: Nachricht loeschen (Inhalt weg) oder ablehnen", async () => {
    const [report] = (await req(root, "GET", "/platform/chat-reports")).json();
    expect((await req(vera, "POST", `/platform/chat-reports/${report.id}/resolve`, { action: "delete" })).statusCode).toBe(403);
    expect((await req(root, "POST", `/platform/chat-reports/${report.id}/resolve`, { action: "loeschen" })).statusCode).toBe(400);
    expect((await req(root, "POST", `/platform/chat-reports/${report.id}/resolve`, { action: "delete", note: "Verstoss gegen Regeln" })).statusCode).toBe(204);

    const [row] = await db.select().from(schema.messages).where(eq(schema.messages.id, badMessage));
    expect(row.ciphertext).toBe("");
    expect(row.deletedAt).not.toBeNull();
    const page = (await req(mia, "GET", `/chat/conversations/${dm}/messages`)).json();
    expect(page.messages.find((m: { id: string }) => m.id === badMessage)).toMatchObject({ body: null, deleted: true });
    expect((await req(root, "GET", "/platform/chat-reports")).json()).toHaveLength(0);
    expect((await req(root, "GET", "/platform/chat-reports?status=actioned")).json()).toHaveLength(1);
    // geloeschte Nachricht erscheint nicht mehr im Klartext
    expect((await req(root, "GET", "/platform/chat-reports?status=actioned")).json()[0].text).toBeNull();

    // zweite Meldung ablehnen
    const second = (await req(ben, "POST", `/chat/conversations/${dm}/messages`, { body: "Noch eine Nachricht" })).json();
    await req(mia, "POST", `/chat/messages/${second.id}/report`, { reason: "other" });
    const [open] = (await req(root, "GET", "/platform/chat-reports")).json();
    expect((await req(root, "POST", `/platform/chat-reports/${open.id}/resolve`, { action: "dismiss" })).statusCode).toBe(204);
    const [kept] = await db.select().from(schema.messages).where(eq(schema.messages.id, second.id));
    expect(kept.deletedAt).toBeNull(); // abgelehnt: Nachricht bleibt

    const resolved = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "platform.chat-report.resolved"));
    expect(resolved.map((a) => (a.meta as { action: string }).action).sort()).toEqual(["delete", "dismiss"]);
  });

  it("Rolle entziehen: Zugriff sofort wieder gesperrt", async () => {
    expect(await auth.setPlatformAdmin("root@example.de", false)).toBe(true);
    expect((await req(root, "GET", "/platform/reports")).statusCode).toBe(403);
    expect((await req(root, "GET", "/auth/me")).json().isPlatformAdmin).toBe(false);
  });
});
