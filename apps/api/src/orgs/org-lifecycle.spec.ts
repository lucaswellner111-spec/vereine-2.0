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
import { ChatService } from "../chat/chat.service";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { createTestDb } from "../testing/test-db";
import { TeamsService } from "../events/teams.service";
import { PrivacyService } from "../privacy/privacy.service";

const password = "ein-sehr-langes-passwort";
const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

/** Austritt, letzter Vorstand, Kontoloeschung und Vereinsloeschung (Variante A). */
describe("Vereins-Lebenszyklus", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const dir = mkdtempSync(join(tmpdir(), "vereine-lifecycle-"));

  beforeAll(async () => {
    process.env.MEDIA_DIR = dir;
    db = await createTestDb();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
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
  const req = (u: U, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });
  async function makeOrg(admin: U, name: string, members: U[]) {
    const slug = (await req(admin, "POST", "/orgs", { name, category: "Sport", city: "Lebensstadt" })).json().slug as string;
    for (const m of members) {
      await req(m, "POST", `/orgs/${slug}/membership`);
      await req(admin, "POST", `/orgs/${slug}/members/${m.id}/decision`, { decision: "approve" });
    }
    return slug;
  }

  describe("Austritt", () => {
    let vera: U, mia: U, ben: U;
    let slug: string, team: string, internal: string, teamEvent: string, open: string, group: string, dm: string;

    beforeAll(async () => {
      [vera, mia, ben] = [await signup("vera"), await signup("mia"), await signup("ben")];
      slug = await makeOrg(vera, "Austritt Verein", [mia, ben]);
      await req(vera, "PUT", `/orgs/${slug}/members/${ben.id}/role`, { role: "moderator" });
      team = (await req(vera, "POST", `/orgs/${slug}/teams`, { name: "Herren" })).json().id;
      await req(vera, "PUT", `/orgs/${slug}/teams/${team}/members/${ben.id}`);
      internal = (await req(vera, "POST", `/orgs/${slug}/events`, { title: "Intern", startsAt: inDays(3) })).json().id;
      teamEvent = (await req(vera, "POST", `/orgs/${slug}/events`, { title: "Training", startsAt: inDays(4), teamId: team })).json().id;
      open = (await req(vera, "POST", `/orgs/${slug}/events`, { title: "Sommerfest", startsAt: inDays(5), visibility: "public" })).json().id;
      for (const e of [internal, teamEvent, open]) await req(ben, "PUT", `/events/${e}/rsvp`, { status: "yes" });
      group = (await req(ben, "POST", "/chat/conversations", { kind: "group", orgSlug: slug, title: "Bens Gruppe", memberIds: [mia.id] })).json().id;
      dm = (await req(ben, "POST", "/chat/conversations", { kind: "direct", userId: mia.id })).json().id;
    });

    it("entfernt Team, interne Zusagen und Vereinsgruppen; Direktchat und oeffentliche Zusage bleiben", async () => {
      // Handler faellt einmal aus -> Austritt gelingt trotzdem, Nachlauf-Job raeumt auf
      const teams = app.get(TeamsService);
      const spy = vi.spyOn(teams, "leaveOrg").mockRejectedValueOnce(new Error("kurz weg"));
      expect((await req(ben, "DELETE", `/orgs/${slug}/members/${ben.id}`)).statusCode).toBe(204);
      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();

      expect(await db.select().from(schema.teamMembers).where(eq(schema.teamMembers.userId, ben.id))).toHaveLength(0);
      const rsvps = (await db.select().from(schema.eventRsvps).where(eq(schema.eventRsvps.userId, ben.id))).map((r) => r.eventId);
      expect(rsvps).toEqual([open]);
      const visible = ((await req(ben, "GET", "/events")).json() as { id: string }[]).map((e) => e.id);
      expect(visible).not.toContain(internal);
      expect(visible).not.toContain(teamEvent);

      expect((await req(ben, "GET", `/chat/conversations/${group}`)).statusCode).toBe(404);
      expect((await req(mia, "GET", `/chat/conversations/${group}`)).json().iAmOwner).toBe(true); // Besitz geht ueber
      expect((await req(ben, "GET", `/chat/conversations/${dm}`)).statusCode).toBe(200);
    });
  });

  describe("letzter Vorstand", () => {
    it("zwei Vorstaende degradieren sich gleichzeitig -> genau einer bleibt", async () => {
      const [ada, eva] = [await signup("ada"), await signup("eva")];
      const slug = await makeOrg(ada, "Doppel Verein", [eva]);
      await req(ada, "PUT", `/orgs/${slug}/members/${eva.id}/role`, { role: "admin" });
      const res = await Promise.all([
        req(ada, "PUT", `/orgs/${slug}/members/${ada.id}/role`, { role: "member" }),
        req(eva, "PUT", `/orgs/${slug}/members/${eva.id}/role`, { role: "member" }),
      ]);
      expect(res.map((r) => r.statusCode).sort()).toEqual([204, 400]);
      const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug));
      const admins = await db.select().from(schema.orgMembers).where(and(eq(schema.orgMembers.orgId, org.id), eq(schema.orgMembers.role, "admin")));
      expect(admins).toHaveLength(1);
    });
  });

  describe("Kontoloeschung", () => {
    it("einziger Vorstand mit weiteren Mitgliedern -> 409, nach Rollenuebergabe 204; falsches Passwort 403", async () => {
      const [olga, paul] = [await signup("olga"), await signup("paul")];
      const slug = await makeOrg(olga, "Olgas Verein", [paul]);
      expect((await req(olga, "DELETE", "/privacy/account", { password: "falsches-passwort-123" })).statusCode).toBe(403);
      const blocked = await req(olga, "DELETE", "/privacy/account", { password });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().message).toContain("„Olgas Verein“");
      expect((await req(olga, "GET", "/auth/me")).statusCode).toBe(200); // nichts geloescht

      await req(olga, "PUT", `/orgs/${slug}/members/${paul.id}/role`, { role: "admin" });
      expect((await req(olga, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);
      expect((await req(paul, "GET", `/orgs/${slug}`)).statusCode).toBe(200);
    });

    it("einziger Vorstand und einziges Mitglied -> Verein wird samt Bereichsdaten geloescht, finalisierte Rechnung bleibt", async () => {
      const [ella, fritz] = [await signup("ella"), await signup("fritz")];
      const slug = await makeOrg(ella, "Aufloese Verein", [fritz]);
      const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug));
      const item = { description: "Beitrag", quantity: 1, unitCents: 1000, vatRate: 0 };
      const fin = (await req(ella, "POST", `/orgs/${slug}/invoices`, { recipientUserId: fritz.id, dueDate: "2030-01-31", items: [item] })).json();
      expect((await req(ella, "POST", `/invoices/${fin.id}/finalize`)).statusCode).toBe(201);
      const draft = (await req(ella, "POST", `/orgs/${slug}/invoices`, { recipientUserId: fritz.id, dueDate: "2030-01-31", items: [item] })).json();
      expect((await req(ella, "POST", `/orgs/${slug}/fee-classes`, { name: "Erwachsene", amountCents: 1000, interval: "yearly" })).statusCode).toBe(201);
      const png = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#123456" } }).png().toBuffer();
      const boundary = "----lifecycle";
      const payload = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
        png,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const img = (await app.inject({ method: "POST", url: "/media/post", payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}`, cookie: ella.cookie } })).json();
      expect((await req(ella, "POST", "/posts", { body: "Vereinsbild", orgSlug: slug, mediaIds: [img.id] })).statusCode).toBe(201);
      const group = (await req(ella, "POST", "/chat/conversations", { kind: "group", orgSlug: slug, title: "Abschied", memberIds: [fritz.id] })).json().id;
      await req(fritz, "POST", `/chat/conversations/${group}/messages`, { body: "Tschuess" });

      // fritz tritt aus -> ella ist einziges Mitglied
      expect((await req(fritz, "DELETE", `/orgs/${slug}/members/${fritz.id}`)).statusCode).toBe(204);
      expect((await req(ella, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);

      expect((await req(fritz, "GET", `/orgs/${slug}`)).statusCode).toBe(404);
      expect(await db.select().from(schema.conversations).where(eq(schema.conversations.id, group))).toHaveLength(0);
      expect(await db.select().from(schema.feeClasses).where(eq(schema.feeClasses.orgId, org.id))).toHaveLength(0);
      expect(await db.select().from(schema.memberProfiles).where(eq(schema.memberProfiles.orgId, org.id))).toHaveLength(0);
      expect(await db.select().from(schema.media).where(eq(schema.media.id, img.id))).toHaveLength(0);
      expect(await db.select().from(schema.invoices).where(eq(schema.invoices.id, draft.id))).toHaveLength(0);
      const [kept] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, fin.id));
      expect(kept).toMatchObject({ status: "open", issuerName: "Aufloese Verein" });
      expect(((await req(fritz, "GET", "/billing/mine")).json() as { id: string }[]).map((i) => i.id)).toContain(fin.id);
    });

    it("Loeschung bricht mittendrin ab -> Konto gesperrt, Nachlauf-Job schliesst ab", async () => {
      const gina = await signup("gina");
      const spy = vi.spyOn(app.get(ChatService), "eraseUser").mockRejectedValueOnce(new Error("Chat-DB weg"));
      expect((await req(gina, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);
      spy.mockRestore();
      expect((await app.inject({ method: "POST", url: "/auth/login", payload: { email: gina.email, password } })).statusCode).toBe(401);
      expect((await req(gina, "GET", "/auth/me")).statusCode).toBe(401);
      expect(await db.select().from(schema.users).where(eq(schema.users.id, gina.id))).toHaveLength(1); // noch nicht fertig

      expect(await app.get(PrivacyService).erasePending(0)).toBeGreaterThanOrEqual(1);
      expect(await db.select().from(schema.users).where(eq(schema.users.id, gina.id))).toHaveLength(0);
    });
  });
});
