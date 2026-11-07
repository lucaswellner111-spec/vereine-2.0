import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fastifyOptions, isStrictRoute } from "./app.setup";

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
