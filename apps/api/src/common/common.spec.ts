import "reflect-metadata";
import { Controller, Get, HttpException, Logger, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { isAllowedPushEndpoint } from "@vereine/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Cache } from "../cache/cache.module";
import { berlinDate, berlinYear } from "./berlin-date";
import { decodeCursor, encodeCursor } from "./cursor";
import { AppErrorFilter } from "./error.filter";
import { redactUrl } from "./log-redact";
import { isUniqueViolation, pgCode } from "./pg-errors";
import { enforceLimit, limitMessage } from "./rate-limit";
import { trustProxySetting } from "../app.setup";

/** Nachbau eines DrizzleQueryError: Meldung enthaelt SQL samt Parametern (darf nie ins Log). */
function dbError(code: string) {
  const err = new Error("Failed query: select * from identity.users where email = $1\nparams: geheim@example.de") as Error & { cause?: unknown; query?: string };
  err.name = "DrizzleQueryError";
  err.query = "select * from identity.users where email = $1";
  err.cause = { code, message: "invalid input syntax" };
  return err;
}

@Controller("t")
class ThrowController {
  @Get("22p02") a() { throw dbError("22P02"); }
  @Get("23505") b() { throw dbError("23505"); }
  @Get("db500") c() { throw dbError("42P01"); }
  @Get("http") d() { throw new HttpException("Teekanne", 418); }
}
@Module({ controllers: [ThrowController] })
class ThrowModule {}

describe("Fehlerfilter", () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [ThrowModule] }).compile();
    app = ref.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false });
    app.useGlobalFilters(new AppErrorFilter(app.getHttpAdapter()));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(() => app.close());
  afterEach(() => vi.restoreAllMocks());

  it("22P02 -> 400 ohne SQL/Parameter in Antwort und Log", async () => {
    const spy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const res = await app.inject({ method: "GET", url: "/t/22p02" });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("Ungültige Eingabe.");
    expect(res.body).not.toMatch(/select|geheim/);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/geheim|select/);
  });

  it("23505 -> 409, HttpException unveraendert", async () => {
    expect((await app.inject({ method: "GET", url: "/t/23505" })).statusCode).toBe(409);
    expect((await app.inject({ method: "GET", url: "/t/http" })).statusCode).toBe(418);
  });

  it("unbekannter DB-Fehler -> 500, Log nur Route, Art und pg-Code", async () => {
    const spy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const res = await app.inject({ method: "GET", url: "/t/db500" });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toMatch(/select|geheim/);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("GET /t/db500: DrizzleQueryError (pg 42P01)");
    expect(logged).not.toMatch(/geheim|select/);
  });
});

describe("Hilfsfunktionen", () => {
  it("pgCode/isUniqueViolation lesen code und cause.code", () => {
    expect(pgCode({ code: "23505" })).toBe("23505");
    expect(pgCode(dbError("22007"))).toBe("22007");
    expect(pgCode(new Error("x"))).toBeUndefined();
    expect(isUniqueViolation(dbError("23505"))).toBe(true);
    expect(isUniqueViolation(dbError("22P02"))).toBe(false);
  });

  it("Cursor: Rundreise, kaputte Cursor -> 400", () => {
    const c = { ts: "2026-11-07 10:00:00.123456+00", id: "8b0f2c5e-1d2a-4c3b-9e8f-0a1b2c3d4e5f" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor(undefined)).toBeNull();
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    for (const bad of ["kaputt", enc({ ts: c.ts, id: "keine-uuid" }), enc({ ts: "gestern", id: c.id }), enc({ ts: "2026-02-31 10:00:00+00'; drop", id: c.id })]) {
      expect(() => decodeCursor(bad)).toThrow(/Ungültiger Cursor/);
    }
  });

  it("enforceLimit: 429 ueber dem Limit, Cache-Ausfall laesst durch (fail open)", async () => {
    let n = 0;
    const cache = { incr: vi.fn(async () => ++n) } as unknown as Cache;
    await enforceLimit(cache, "x:1", 2, 60, limitMessage("Tests"));
    await enforceLimit(cache, "x:1", 2, 60, limitMessage("Tests"));
    await expect(enforceLimit(cache, "x:1", 2, 60, limitMessage("Tests"))).rejects.toMatchObject({ status: 429 });
    expect((cache.incr as any).mock.calls[0][0]).toBe("lim:x:1");
    const broken = { incr: async () => { throw new Error("redis weg"); } } as unknown as Cache;
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    await expect(enforceLimit(broken, "x:2", 0, 60, "nie")).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });

  it("berlinDate: Silvester-Nacht und Sommerzeit", () => {
    expect(berlinDate(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(berlinYear(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
    expect(berlinDate(new Date("2026-07-15T21:59:00Z"))).toBe("2026-07-15");
    expect(berlinDate(new Date("2026-07-15T22:01:00Z"))).toBe("2026-07-16");
  });

  it("redactUrl: Token im Pfad und Query-Werte werden entfernt", () => {
    expect(redactUrl("/calendar/abc123geheim.ics")).toBe("/calendar/…");
    expect(redactUrl("/invites/tok123/accept")).toBe("/invites/…/accept");
    expect(redactUrl("/profiles/search?q=max%20mustermann&cursor=xyz")).toBe("/profiles/search?q=…&cursor=…");
    expect(redactUrl("/feed")).toBe("/feed");
  });

  it("trustProxySetting: Standard, gueltige Liste, ungueltige Werte -> Standard mit Warnung", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(trustProxySetting(undefined)).toBe("loopback,linklocal,uniquelocal");
    expect(trustProxySetting("10.0.0.0/8, 127.0.0.1")).toBe("10.0.0.0/8,127.0.0.1");
    expect(trustProxySetting("true")).toBe("loopback,linklocal,uniquelocal");
    expect(warn).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("Push-Endpunkte: nur bekannte Dienste per https auf Port 443", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://evil.example.com/push")).toBe(false);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://10.0.0.5/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.de/x")).toBe(false);
  });
});
