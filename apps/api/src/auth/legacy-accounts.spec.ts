import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMAIL_NOT_VERIFIED } from "@vereine/shared";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { MemoryMailDriver } from "../mail/mail.drivers";
import { MAIL_DRIVER } from "../mail/mail.service";
import { confirmEmailForTest } from "../testing/auth";
import { createTestDb, type TestDb } from "../testing/test-db";
import { AuthService } from "./auth.service";

const password = "ein-sehr-langes-passwort";

/**
 * Altkonten (vor der E-Mail-Bestaetigung): duerfen weiter anmelden und LESEN, brauchen die Bestaetigung aber fuer alles
 * mit Aussenwirkung (Verein gruenden, Einladungen, Import, Beitragslauf, Rechnung versenden, AVV).
 */
describe("Altkonten ohne bestaetigte Adresse", () => {
  let app: NestFastifyApplication;
  let db: TestDb;
  const mails = new MemoryMailDriver();

  beforeAll(async () => {
    db = await createTestDb();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).overrideProvider(MAIL_DRIVER).useValue(mails).compile();
    app = ref.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(() => app.close());

  const call = (method: "GET" | "POST" | "PUT", url: string, cookie: string, payload?: object) => app.inject({ method, url, payload, headers: { cookie } });

  it("lesen ja, Aktionen mit Aussenwirkung nein, Bestaetigungsmail erneut senden geht", async () => {
    const email = "alt@example.de";
    await app.inject({ method: "POST", url: "/auth/register", payload: { email, password, displayName: "Alt", confirmAge16: true, acceptTerms: true, acceptPrivacy: true } });
    await confirmEmailForTest(app, email);
    const cookie = String((await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } })).headers["set-cookie"]).split(";")[0];
    const created = await call("POST", "/orgs", cookie, { name: "SV Alt", category: "Sport", city: "Altstadt" });
    expect(created.statusCode).toBe(201);
    const slug = created.json().slug as string;

    // Konto "von frueher": Adresse nie bestaetigt
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    await db.update(schema.users).set({ emailVerifiedAt: null }).where(eq(schema.users.id, user.id));
    await app.get(AuthService).invalidateUserSessions(user.id);

    // Lesen und Anmelden bleiben erlaubt
    const me = await call("GET", "/auth/me", cookie);
    expect(me.statusCode).toBe(200);
    expect(me.json().emailVerified).toBe(false);
    for (const url of ["/feed", `/orgs/${slug}`, `/orgs/${slug}/member-registry`, `/orgs/${slug}/invites`, `/orgs/${slug}/invoices`, `/orgs/${slug}/fee-runs`]) {
      expect((await call("GET", url, cookie)).statusCode, url).toBe(200);
    }

    // Alles mit Aussenwirkung braucht die Bestaetigung (403 mit festem Text)
    const blocked: Array<[string, string, object?]> = [
      ["POST", "/orgs", { name: "SV Zweit", category: "Sport", city: "Neustadt" }],
      ["POST", `/orgs/${slug}/invites`, {}],
      ["POST", `/orgs/${slug}/member-imports`, undefined],
      ["POST", `/orgs/${slug}/fee-runs`, { year: 2026 }],
      ["POST", "/invoices/00000000-0000-4000-8000-000000000000/finalize", undefined],
    ];
    for (const [method, url, body] of blocked) {
      const res = await call(method as "POST", url, cookie, body);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(res.json().message, `${method} ${url}`).toBe(EMAIL_NOT_VERIFIED);
    }

    // Erneut senden: Mail geht raus (Rate-Limit pro Adresse/IP greift im Dienst, siehe email-flows.spec)
    mails.clear();
    expect((await call("POST", "/auth/email/resend", cookie, {})).statusCode).toBe(204);
    expect(mails.last(email, "verify-email")).toBeTruthy();

    // Nach Bestaetigung: frei
    await confirmEmailForTest(app, email);
    await app.get(AuthService).invalidateUserSessions(user.id);
    expect((await call("POST", `/orgs/${slug}/invites`, cookie, {})).statusCode).toBe(201);
  });
});
