import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureApp } from "../app.setup";
import { DB, DbModule } from "../db/db.module";
import * as schema from "../db/schema";
import { AuthModule } from "./auth.module";

const valid = {
  email: "Anna@Example.de",
  password: "ein-sehr-langes-passwort",
  displayName: "Anna",
  confirmAge16: true,
  acceptTerms: true,
  acceptPrivacy: true,
};

describe("Auth", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });

    const moduleRef = await Test.createTestingModule({ imports: [DbModule, AuthModule] })
      .overrideProvider(DB)
      .useValue(db)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (url: string, payload: unknown, cookie?: string) =>
    app.inject({ method: "POST", url, payload: payload as object, headers: cookie ? { cookie } : {} });

  it("registriert, normalisiert die E-Mail und speichert Einwilligungen", async () => {
    const res = await post("/auth/register", valid);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.email).toBe("anna@example.de");
    expect(body).not.toHaveProperty("passwordHash");

    const [row] = await db.select().from(schema.users);
    expect(row.passwordHash.startsWith("$argon2id$")).toBe(true);
    const granted = await db.select().from(schema.consents);
    expect(granted.map((c) => c.purpose).sort()).toEqual(["privacy", "terms"]);
  });

  it("lehnt doppelte E-Mail mit 409 ab", async () => {
    const res = await post("/auth/register", { ...valid, email: "anna@example.de" });
    expect(res.statusCode).toBe(409);
  });

  it("lehnt kurzes Passwort und fehlende Zustimmung ab", async () => {
    const weak = await post("/auth/register", { ...valid, email: "b@example.de", password: "kurz" });
    expect(weak.statusCode).toBe(400);
    const noConsent = await post("/auth/register", { ...valid, email: "c@example.de", acceptPrivacy: false });
    expect(noConsent.statusCode).toBe(400);
    const underage = await post("/auth/register", { ...valid, email: "d@example.de", confirmAge16: false });
    expect(underage.statusCode).toBe(400);
  });

  it("Login setzt HttpOnly-Cookie, /me liefert Nutzer, Logout beendet Session", async () => {
    const login = await post("/auth/login", { email: "anna@example.de", password: valid.password });
    expect(login.statusCode).toBe(200);
    const setCookie = String(login.headers["set-cookie"]);
    expect(setCookie).toMatch(/sid=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const cookie = setCookie.split(";")[0];

    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe("anna@example.de");

    // Im Klartext darf der Token nicht in der DB stehen.
    const stored = await db.select().from(schema.sessions);
    expect(stored.some((s) => cookie.includes(s.tokenHash))).toBe(false);

    const out = await post("/auth/logout", {}, cookie);
    expect(out.statusCode).toBe(204);
    const after = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it("antwortet bei falschem Passwort und unbekannter E-Mail gleich mit 401", async () => {
    const wrong = await post("/auth/login", { email: "anna@example.de", password: "falsch-falsch-falsch" });
    const unknown = await post("/auth/login", { email: "niemand@example.de", password: "falsch-falsch-falsch" });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().message).toBe(unknown.json().message);
  });

  it("/me ohne Cookie ist 401", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
  });
});
