import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureApp } from "../app.setup";
import { AuthModule } from "../auth/auth.module";
import { CacheModule } from "../cache/cache.module";
import { DB, DbModule } from "../db/db.module";
import * as schema from "../db/schema";
import { PrivacyModule } from "./privacy.module";

const credentials = { email: "lena@example.de", password: "ein-sehr-langes-passwort" };

describe("Privacy", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let cookie: string;

  beforeAll(async () => {
    db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
    const moduleRef = await Test.createTestingModule({
      imports: [DbModule, CacheModule, AuthModule, PrivacyModule],
    })
      .overrideProvider(DB)
      .useValue(db)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        ...credentials,
        displayName: "Lena",
        confirmAge16: true,
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: credentials });
    cookie = String(login.headers["set-cookie"]).split(";")[0];
  });

  afterAll(async () => {
    await app.close();
  });

  const call = (method: "GET" | "PUT" | "DELETE", url: string, payload?: object, withCookie = true) =>
    app.inject({ method, url, payload, headers: withCookie ? { cookie } : {} });

  it("verlangt Login", async () => {
    expect((await call("GET", "/privacy/consents", undefined, false)).statusCode).toBe(401);
    expect((await call("GET", "/privacy/export", undefined, false)).statusCode).toBe(401);
  });

  it("zeigt Einwilligungen: terms/privacy erteilt, optionale aus", async () => {
    const res = await call("GET", "/privacy/consents");
    const byPurpose = Object.fromEntries(res.json().map((c: { purpose: string; granted: boolean }) => [c.purpose, c.granted]));
    expect(byPurpose).toMatchObject({
      terms: true,
      privacy: true,
      personalized_feed: false,
      analytics: false,
      marketing_email: false,
    });
  });

  it("erteilt und widerruft Einwilligung append-only", async () => {
    await call("PUT", "/privacy/consents", { purpose: "personalized_feed", granted: true });
    const on = await call("GET", "/privacy/consents");
    expect(on.json().find((c: { purpose: string }) => c.purpose === "personalized_feed").granted).toBe(true);

    await call("PUT", "/privacy/consents", { purpose: "personalized_feed", granted: false });
    const off = await call("GET", "/privacy/consents");
    expect(off.json().find((c: { purpose: string }) => c.purpose === "personalized_feed").granted).toBe(false);

    const history = await db.select().from(schema.consents);
    expect(history.filter((c) => c.purpose === "personalized_feed")).toHaveLength(2);
  });

  it("verbietet das Aendern von Vertragszwecken", async () => {
    const res = await call("PUT", "/privacy/consents", { purpose: "terms", granted: false });
    expect(res.statusCode).toBe(400);
  });

  it("exportiert Daten ohne Passwort-Hash", async () => {
    const res = await call("GET", "/privacy/export");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/meine-daten\.json/);
    const body = res.json();
    expect(body.profile.email).toBe(credentials.email);
    expect(JSON.stringify(body)).not.toMatch(/argon2/);
    expect(body.consents.length).toBeGreaterThan(0);
  });

  it("Konto loeschen: falsches Passwort 403, richtiges loescht alles", async () => {
    const wrong = await call("DELETE", "/privacy/account", { password: "falsch-falsch-falsch" });
    expect(wrong.statusCode).toBe(403);

    const ok = await call("DELETE", "/privacy/account", { password: credentials.password });
    expect(ok.statusCode).toBe(204);

    expect(await db.select().from(schema.users)).toHaveLength(0);
    expect(await db.select().from(schema.consents)).toHaveLength(0);
    expect(await db.select().from(schema.sessions)).toHaveLength(0);
    const audit = await db.select().from(schema.auditLog);
    expect(audit.every((a) => a.userId === null)).toBe(true);
    expect((await call("GET", "/auth/me")).statusCode).toBe(401);
  });
});
