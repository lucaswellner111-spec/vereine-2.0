import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import RedisMock from "ioredis-mock";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { AuthService } from "../auth/auth.service";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { CACHE, REDIS, type Cache } from "./cache.module";

const password = "ein-sehr-langes-passwort";

async function boot(overrides: { redis?: unknown; cache?: Cache } = {}, rateLimit = false) {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
  let builder = Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db);
  if (overrides.redis) builder = builder.overrideProvider(REDIS).useValue(overrides.redis);
  if (overrides.cache) builder = builder.overrideProvider(CACHE).useValue(overrides.cache);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configureApp(app, { rateLimit });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, db, moduleRef };
}

describe("Redis: Session-Cache, Rate-Limit, Aufraeumen, Health", () => {
  const redis = new RedisMock();
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let auth: AuthService;
  let cookie: string;
  let userId: string;

  beforeAll(async () => {
    ({ app, db } = await boot({ redis }));
    auth = app.get(AuthService);
    const reg = await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email: "r@example.de", password, displayName: "Rita", confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    userId = reg.json().id;
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "r@example.de", password } });
    cookie = String(login.headers["set-cookie"]).split(";")[0];
  });

  afterAll(async () => {
    await app.close();
  });

  const me = () => app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });

  it("cached Sessions in Redis (nur Hash als Schluessel) und spart die DB-Abfrage", async () => {
    expect((await me()).statusCode).toBe(200);
    const keys = await redis.keys("sess:*");
    expect(keys).toHaveLength(1);
    expect(cookie).not.toContain(keys[0].replace("sess:", ""));
    const ttl = await redis.ttl(keys[0]);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);

    // Session in der DB loeschen: der Cache beantwortet weiter (bis zum TTL-Ablauf)
    const [row] = await db.select().from(schema.sessions);
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, row.tokenHash));
    expect((await me()).statusCode).toBe(200);
    // ... nach Cache-Invalidierung ist sie weg
    await redis.del(keys[0]);
    expect((await me()).statusCode).toBe(401);
  });

  it("Logout entfernt den Cache-Eintrag sofort", async () => {
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "r@example.de", password } });
    cookie = String(login.headers["set-cookie"]).split(";")[0];
    expect((await me()).statusCode).toBe(200);
    expect(await redis.keys("sess:*")).toHaveLength(1);
    await app.inject({ method: "POST", url: "/auth/logout", payload: {}, headers: { cookie } });
    expect(await redis.keys("sess:*")).toHaveLength(0);
    expect((await me()).statusCode).toBe(401);
  });

  it("Kontoloeschung invalidiert den Cache aller Sessions", async () => {
    const l1 = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "r@example.de", password } });
    const l2 = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "r@example.de", password } });
    const c1 = String(l1.headers["set-cookie"]).split(";")[0];
    const c2 = String(l2.headers["set-cookie"]).split(";")[0];
    for (const c of [c1, c2]) await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: c } });
    expect((await redis.keys("sess:*")).length).toBe(2);

    const del = await app.inject({ method: "DELETE", url: "/privacy/account", payload: { password }, headers: { cookie: c1 } });
    expect(del.statusCode).toBe(204);
    expect(await redis.keys("sess:*")).toHaveLength(0);
    for (const c of [c1, c2]) {
      expect((await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: c } })).statusCode).toBe(401);
    }
    expect(userId).toBeTruthy();
  });

  it("Aufraeum-Job entfernt abgelaufene Sessions, aktive bleiben", async () => {
    await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email: "s@example.de", password, displayName: "Sam", confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    await app.inject({ method: "POST", url: "/auth/login", payload: { email: "s@example.de", password } });
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, "s@example.de"));
    await db.insert(schema.sessions).values({ tokenHash: "alt", userId: user.id, expiresAt: new Date(Date.now() - 1000) });

    expect(await auth.purgeExpiredSessions()).toBe(1);
    const left = await db.select().from(schema.sessions);
    expect(left.map((s) => s.tokenHash)).not.toContain("alt");
    expect(left).toHaveLength(1);
  });

  it("Health: /health live, /health/ready prueft DB und Redis", async () => {
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    const ready = await app.inject({ method: "GET", url: "/health/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: "ok", db: "up", cache: "up (redis)" });
  });
});

describe("Redis: Rate-Limit", () => {
  it("zaehlt in Redis (geteilt zwischen Servern) und sperrt Login nach 10 Versuchen", async () => {
    const redis = new RedisMock();
    const { app } = await boot({ redis }, true);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "x@example.de", password: "falsch-falsch-falsch" } });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect((await redis.keys("rl:*")).length).toBeGreaterThan(0);
    const blocked = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "x@example.de", password: "falsch-falsch-falsch" } });
    expect(blocked.json().message).toMatch(/Zu viele Anfragen/);
    // allgemeine Routen haben ein hoeheres Limit
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    await app.close();
  });
});

describe("Health: Ausfall", () => {
  it("meldet 503, wenn der Cache nicht antwortet", async () => {
    const broken: Cache = {
      kind: "redis",
      get: async () => null,
      set: async () => undefined,
      del: async () => undefined,
      incr: async () => 1,
      ping: async () => false,
    };
    const { app } = await boot({ cache: broken });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: "degraded", cache: "down" });
    // Liveness bleibt gruen
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    await app.close();
  });
});
