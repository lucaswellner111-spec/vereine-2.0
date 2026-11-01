import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";

describe("Messwerte (/metrics)", () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    delete process.env.METRICS_TOKEN;
    await app.close();
  });

  it("existiert ohne METRICS_TOKEN nicht", async () => {
    delete process.env.METRICS_TOKEN;
    expect((await app.inject({ method: "GET", url: "/metrics" })).statusCode).toBe(404);
  });

  it("verlangt den Token und liefert dann Prometheus-Text", async () => {
    process.env.METRICS_TOKEN = "geheimer-test-token";
    expect((await app.inject({ method: "GET", url: "/metrics" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/metrics", headers: { authorization: "Bearer falsch" } })).statusCode).toBe(401);
    await app.inject({ method: "GET", url: "/health" });
    await app.inject({ method: "GET", url: "/auth/me" }); // 401 wird als 4xx gezaehlt
    const res = await app.inject({ method: "GET", url: "/metrics", headers: { authorization: "Bearer geheimer-test-token" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toMatch(/klubnest_http_requests_total\{method="GET",status="2xx"\} \d+/);
    expect(res.body).toMatch(/klubnest_http_requests_total\{method="GET",status="4xx"\} \d+/);
    expect(res.body).toContain("klubnest_http_request_duration_seconds_count");
    expect(res.body).toContain("klubnest_db_up 1");
    expect(res.body).toContain("process_resident_memory_bytes");
    // keine Pfade oder Nutzerdaten in den Messwerten
    expect(res.body).not.toContain("/auth/me");
  });
});
