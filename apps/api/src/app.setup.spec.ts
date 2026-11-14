import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fastifyRateLimit from "@fastify/rate-limit";
import { fastifyOptions, isStrictRoute, rateLimitAllowList } from "./app.setup";

describe("Proxy-Vertrauen (TRUST_PROXY)", () => {
  const app = Fastify({ ...fastifyOptions({ logger: false }) });
  beforeAll(async () => {
    app.get("/ip", async (req) => ({ ip: req.ip }));
    await app.ready();
  });
  afterAll(() => app.close());

  const ip = async (remoteAddress: string) =>
    (await app.inject({ method: "GET", url: "/ip", remoteAddress, headers: { "x-forwarded-for": "203.0.113.9" } })).json().ip;

  it("Proxy im Docker-Netz (privat) -> Client-IP aus X-Forwarded-For", async () => {
    expect(await ip("172.18.0.5")).toBe("203.0.113.9");
    expect(await ip("127.0.0.1")).toBe("203.0.113.9");
  });

  it("oeffentliche Gegenstelle -> X-Forwarded-For wird ignoriert (nicht faelschbar)", async () => {
    expect(await ip("198.51.100.1")).toBe("198.51.100.1");
  });

  it("strenge Routen werden per Routenmuster erkannt, nicht per Roh-URL", () => {
    expect(isStrictRoute({ method: "POST", routeOptions: { url: "/auth/login" } })).toBe(true);
    expect(isStrictRoute({ method: "GET", routeOptions: { url: "/auth/me" } })).toBe(false);
    expect(isStrictRoute({ method: "DELETE", routeOptions: { url: "/privacy/account" } })).toBe(true);
  });
});

describe("Rate-Limit-Ausnahme fuer den Lastgenerator (RATE_LIMIT_ALLOWLIST)", () => {
  it("liest kommagetrennte IPs, leer = keine Ausnahme", () => {
    expect(rateLimitAllowList({} as NodeJS.ProcessEnv)).toEqual([]);
    expect(rateLimitAllowList({ RATE_LIMIT_ALLOWLIST: " 203.0.113.7 , ,198.51.100.2" } as NodeJS.ProcessEnv)).toEqual(["203.0.113.7", "198.51.100.2"]);
  });

  async function limited(allow: string[], ip: string) {
    const app = Fastify({ logger: false });
    await app.register(fastifyRateLimit, { max: 3, timeWindow: "1 minute", allowList: allow });
    app.get("/x", async () => "ok");
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await app.inject({ method: "GET", url: "/x", remoteAddress: ip })).statusCode);
    await app.close();
    return codes;
  }

  it("nur die freigegebene IP wird nicht gebremst", async () => {
    expect(await limited(["203.0.113.7"], "203.0.113.7")).toEqual([200, 200, 200, 200, 200, 200]);
    expect(await limited(["203.0.113.7"], "198.51.100.9")).toContain(429);
    expect(await limited([], "203.0.113.7")).toContain(429);
  });
});
