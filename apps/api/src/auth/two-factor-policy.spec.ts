import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { TWO_FACTOR_REQUIRED_CODE } from "@vereine/shared";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { confirmEmailForTest } from "../testing/auth";
import { createTestDb, type TestDb } from "../testing/test-db";
import { AuthService } from "./auth.service";
import { TWO_FACTOR_GRACE_DAYS, twoFactorEnforced } from "./two-factor-policy.service";
import { base32Decode, hotp, stepAt } from "./totp";

const password = "ein-sehr-langes-passwort";
const DAY = 24 * 3600_000;

describe("twoFactorEnforced", () => {
  it("ohne Angabe nur in Produktion, per Variable umschaltbar", () => {
    expect(twoFactorEnforced({})).toBe(false);
    expect(twoFactorEnforced({ NODE_ENV: "test" })).toBe(false);
    expect(twoFactorEnforced({ NODE_ENV: "production" })).toBe(true);
    expect(twoFactorEnforced({ NODE_ENV: "production", TWOFACTOR_ENFORCE: "false" })).toBe(false);
    expect(twoFactorEnforced({ TWOFACTOR_ENFORCE: "true" })).toBe(true);
    expect(twoFactorEnforced({ TWOFACTOR_ENFORCE: "1" })).toBe(true);
  });
});

describe("Zwei-Faktor-Pflicht fuer Vorstaende und Plattform-Admins", () => {
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
  afterEach(() => {
    delete process.env.TWOFACTOR_ENFORCE;
  });

  const call = (method: "GET" | "POST" | "PUT", url: string, cookie?: string, payload?: object) => app.inject({ method, url, payload, headers: cookie ? { cookie } : {} });
  async function signup(name: string) {
    const email = `${name}@example.de`;
    await call("POST", "/auth/register", undefined, { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true });
    await confirmEmailForTest(app, email);
    const login = await call("POST", "/auth/login", undefined, { email, password });
    return { email, cookie: String(login.headers["set-cookie"]).split(";")[0] };
  }
  const setSince = async (email: string, since: Date) => {
    await db.update(schema.users).set({ twoFactorRequiredSince: since }).where(eq(schema.users.email, email));
    await app.get(AuthService).invalidateUserSessions((await db.select().from(schema.users).where(eq(schema.users.email, email)))[0].id);
  };
  async function enableTotp(cookie: string) {
    const secret = (await call("POST", "/auth/2fa/setup", cookie)).json().secret as string;
    const code = hotp(base32Decode(secret), stepAt(Date.now()));
    const res = await call("POST", "/auth/2fa/enable", cookie, { code });
    expect(res.statusCode).toBe(200);
    return res.json().recoveryCodes as string[];
  }

  let vera: { email: string; cookie: string };
  let slug: string;
  const SENSITIVE = () => [
    `/orgs/${slug}/member-registry`,
    `/orgs/${slug}/invites`,
    `/orgs/${slug}/invoices`,
    `/orgs/${slug}/fee-runs`,
    `/orgs/${slug}/member-imports/pending`,
    `/orgs/${slug}/moderation/posts`,
    `/orgs/${slug}/billing-profile`,
    `/orgs/${slug}/members`,
  ];

  it("ohne Pflicht (Standard in Tests): Vorstand arbeitet normal, Richtlinie meldet nichts", async () => {
    vera = await signup("vera");
    const created = await call("POST", "/orgs", vera.cookie, { name: "SV Pflicht", category: "Sport", city: "Sicherstadt" });
    expect(created.statusCode).toBe(201);
    slug = created.json().slug;
    expect((await call("GET", "/security/two-factor", vera.cookie)).json()).toMatchObject({ required: false, blocked: false });
    expect((await call("GET", `/orgs/${slug}/member-registry`, vera.cookie)).statusCode).toBe(200);
  });

  it("mit Pflicht: Uebergangsfrist laeuft ab dem ersten Pruefen, noch nichts gesperrt", async () => {
    process.env.TWOFACTOR_ENFORCE = "true";
    const before = Date.now();
    const res = await call("GET", "/security/two-factor", vera.cookie);
    const policy = res.json();
    expect(policy).toMatchObject({ required: true, enabled: false, reason: "org-admin", blocked: false });
    const deadline = new Date(policy.deadline).getTime();
    expect(deadline).toBeGreaterThanOrEqual(before + TWO_FACTOR_GRACE_DAYS.orgAdmin * DAY - 5000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + TWO_FACTOR_GRACE_DAYS.orgAdmin * DAY + 5000);
    for (const url of SENSITIVE()) expect((await call("GET", url, vera.cookie)).statusCode, url).toBe(200);
    // Der Fristbeginn bleibt beim zweiten Aufruf gleich
    expect((await call("GET", "/security/two-factor", vera.cookie)).json().deadline).toBe(policy.deadline);
  });

  it("nach Fristende: sensible Aktionen 403 mit Fehlercode, Einstellungen und Lesen des Rests bleiben offen", async () => {
    process.env.TWOFACTOR_ENFORCE = "true";
    await setSince(vera.email, new Date(Date.now() - 15 * DAY));
    expect((await call("GET", "/security/two-factor", vera.cookie)).json()).toMatchObject({ blocked: true, required: true, enabled: false });
    for (const url of SENSITIVE()) {
      const res = await call("GET", url, vera.cookie);
      expect(res.statusCode, url).toBe(403);
      expect(res.json().code, url).toBe(TWO_FACTOR_REQUIRED_CODE);
    }
    expect((await call("POST", `/orgs/${slug}/invites`, vera.cookie, {})).statusCode).toBe(403);
    expect((await call("GET", "/auth/2fa", vera.cookie)).statusCode).toBe(200); // Einrichtung muss erreichbar bleiben
    expect((await call("GET", `/orgs/${slug}`, vera.cookie)).statusCode).toBe(200);
    // Pflicht abgeschaltet: wieder frei
    process.env.TWOFACTOR_ENFORCE = "false";
    expect((await call("GET", `/orgs/${slug}/member-registry`, vera.cookie)).statusCode).toBe(200);
  });

  it("einfache Mitglieder sind nie betroffen, Kassenwarte (Zugriff auf Personendaten) schon", async () => {
    process.env.TWOFACTOR_ENFORCE = "true";
    const tom = await signup("tom");
    expect((await call("GET", "/security/two-factor", tom.cookie)).json()).toMatchObject({ required: false, blocked: false });
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug));
    const [tomRow] = await db.select().from(schema.users).where(eq(schema.users.email, tom.email));
    await db.insert(schema.orgMembers).values({ orgId: org.id, userId: tomRow.id, role: "treasurer", status: "active" });
    expect((await call("GET", "/security/two-factor", tom.cookie)).json()).toMatchObject({ required: true, reason: "org-admin" });
  });

  it("nach der Einrichtung (TOTP aktiv) ist alles wieder frei und Notfallcodes wurden erzeugt", async () => {
    process.env.TWOFACTOR_ENFORCE = "true";
    const codes = await enableTotp(vera.cookie);
    expect(codes).toHaveLength(10);
    expect((await call("GET", "/security/two-factor", vera.cookie)).json()).toMatchObject({ required: true, enabled: true, blocked: false, deadline: null });
    for (const url of SENSITIVE()) expect((await call("GET", url, vera.cookie)).statusCode, url).toBe(200);
  });

  it("Plattform-Admin: keine Uebergangsfrist, Moderation und Plattform-Werkzeuge sofort gesperrt bis TOTP aktiv", async () => {
    const root = await signup("root");
    await app.get(AuthService).setPlatformAdmin(root.email, true);
    expect((await call("GET", "/platform/mail-quota", root.cookie)).statusCode).toBe(200); // Pflicht aus
    process.env.TWOFACTOR_ENFORCE = "true";
    const blocked = await call("GET", "/platform/mail-quota", root.cookie);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe(TWO_FACTOR_REQUIRED_CODE);
    expect((await call("GET", "/security/two-factor", root.cookie)).json()).toMatchObject({ reason: "platform", blocked: true });
    await enableTotp(root.cookie);
    expect((await call("GET", "/platform/mail-quota", root.cookie)).statusCode).toBe(200);
  });
});
