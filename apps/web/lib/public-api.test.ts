import { afterEach, describe, expect, it, vi } from "vitest";

const hdrs = new Headers();
vi.mock("next/headers", () => ({ headers: async () => hdrs }));

import { fetchPublic, forwardedFor } from "./public-api";

afterEach(() => {
  for (const k of [...hdrs.keys()]) hdrs.delete(k);
  vi.unstubAllGlobals();
});

describe("Besucher-IP fuer die oeffentliche API", () => {
  it("nur X-Real-IP (von Caddy gesetzt) wird als X-Forwarded-For weitergereicht", async () => {
    hdrs.set("x-real-ip", "203.0.113.9");
    hdrs.set("x-forwarded-for", "1.2.3.4");
    expect(await forwardedFor()).toEqual({ "x-forwarded-for": "203.0.113.9" });
  });

  it("ohne X-Real-IP (lokal) kein Header, auch wenn X-Forwarded-For mitkommt; Unsinn wird verworfen", async () => {
    hdrs.set("x-forwarded-for", "1.2.3.4");
    expect(await forwardedFor()).toEqual({});
    hdrs.set("x-real-ip", "1.2.3.4, 5.6.7.8"); // keine Liste, nur eine einzelne IP
    expect(await forwardedFor()).toEqual({});
  });

  it("fetchPublic ohne Next-Datencache", async () => {
    hdrs.set("x-real-ip", "2001:db8::1");
    const fn = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fn);
    expect(await fetchPublic("/orgs")).toEqual([]);
    expect(fn).toHaveBeenCalledWith("http://localhost:4000/public/orgs", { headers: { "x-forwarded-for": "2001:db8::1" }, cache: "no-store" });
  });
});
