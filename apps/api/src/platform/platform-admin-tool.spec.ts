import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { AuthService } from "../auth/auth.service";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { confirmEmailForTest } from "../testing/auth";
import { createTestDb, type TestDb } from "../testing/test-db";

const password = "ein-sehr-langes-passwort";

/** Plattform-Werkzeug "Vorstand setzen": nur fuer Vereine ohne aktiven Vorstand, protokolliert. */
describe("Plattform: Vorstand setzen", () => {
  let app: NestFastifyApplication;
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = ref.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(() => app.close());

  type U = { email: string; cookie: string; id: string };
  async function signup(name: string): Promise<U> {
    const email = `${name}@example.de`;
    await app.inject({ method: "POST", url: "/auth/register", payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true } });
    await confirmEmailForTest(app, email);
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { email, cookie: String(login.headers["set-cookie"]).split(";")[0], id: login.json().id };
  }
  const call = (u: U, method: "GET" | "POST", url: string, payload?: object) => app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });

  it("setzt einen Vorstand nur bei verwaistem Verein; Rechte, Fehlerfaelle und Protokoll", async () => {
    const vera = await signup("vera");
    const tom = await signup("tom");
    const root = await signup("root");
    await app.get(AuthService).setPlatformAdmin(root.email, true);
    const slug = (await call(vera, "POST", "/orgs", { name: "SV Verwaist", category: "Sport", city: "Leerstadt" })).json().slug as string;
    await call(tom, "POST", `/orgs/${slug}/membership`);
    await call(vera, "POST", `/orgs/${slug}/members/${tom.id}/decision`, { decision: "approve" });
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug));

    // Nicht-Admins kommen nicht heran, solange der Verein einen Vorstand hat gibt es 409
    expect((await call(vera, "POST", `/platform/orgs/${slug}/admin`, { email: tom.email })).statusCode).toBe(403);
    const hasAdmin = await call(root, "POST", `/platform/orgs/${slug}/admin`, { email: tom.email });
    expect(hasAdmin.statusCode).toBe(409);

    // Grenzfall: der Vorstand ist weg (z. B. Kontoloeschung), nur Tom bleibt als Mitglied
    await db.delete(schema.orgMembers).where(and(eq(schema.orgMembers.orgId, org.id), eq(schema.orgMembers.userId, vera.id)));
    expect((await call(root, "POST", `/platform/orgs/${slug}/admin`, { email: "gibtsnicht@example.de" })).statusCode).toBe(404);
    expect((await call(root, "POST", `/platform/orgs/${slug}/admin`, { email: "kein-mail" })).statusCode).toBe(400);
    expect((await call(root, "POST", "/platform/orgs/gibts-nicht/admin", { email: tom.email })).statusCode).toBe(404);

    expect((await call(root, "POST", `/platform/orgs/${slug.toUpperCase()}/admin`, { email: tom.email.toUpperCase() })).statusCode).toBe(204);
    const [member] = await db.select().from(schema.orgMembers).where(and(eq(schema.orgMembers.orgId, org.id), eq(schema.orgMembers.userId, tom.id)));
    expect(member).toMatchObject({ role: "admin", status: "active" });
    // Tom kann jetzt als Vorstand arbeiten
    expect((await call(tom, "GET", `/orgs/${slug}/invites`)).statusCode).toBe(200);
    // Zweiter Versuch: Verein hat wieder einen Vorstand
    expect((await call(root, "POST", `/platform/orgs/${slug}/admin`, { email: tom.email })).statusCode).toBe(409);

    const log = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "platform.org.admin.set"));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ userId: root.id, meta: { orgId: org.id, memberId: tom.id } });
  });

  it("legt die Mitgliedschaft an, wenn die Person noch gar nicht Mitglied ist", async () => {
    const vera = await signup("vera2");
    const ida = await signup("ida2");
    const root = await signup("root2");
    await app.get(AuthService).setPlatformAdmin(root.email, true);
    const slug = (await call(vera, "POST", "/orgs", { name: "SV Neuanfang", category: "Sport", city: "Neustadt" })).json().slug as string;
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug));
    await db.delete(schema.orgMembers).where(eq(schema.orgMembers.orgId, org.id));
    expect((await call(root, "POST", `/platform/orgs/${slug}/admin`, { email: ida.email })).statusCode).toBe(204);
    const [m] = await db.select().from(schema.orgMembers).where(eq(schema.orgMembers.orgId, org.id));
    expect(m).toMatchObject({ userId: ida.id, role: "admin", status: "active" });
  });
});
