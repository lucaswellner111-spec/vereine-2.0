import { createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaptchaChallenge } from "@vereine/shared";
import { captchaToken, encodeSolution, resetCaptchaCache, solveChallenge } from "./captcha";
import { sha256Hex } from "./sha256";

const node = (t: string) => createHash("sha256").update(t).digest("hex");

describe("sha256Hex", () => {
  it("Testvektoren und Grenzfaelle der Blocklaenge", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    for (const len of [1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const text = randomBytes(len).toString("hex").slice(0, len);
      expect(sha256Hex(text), `Laenge ${len}`).toBe(node(text));
    }
    expect(sha256Hex("Größe €")).toBe(node("Größe €"));
  });
});

describe("Proof-of-Work im Browser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCaptchaCache();
  });

  const challenge = (n: number): CaptchaChallenge => {
    const salt = "deadbeef?expires=9999999999";
    return { algorithm: "SHA-256", challenge: node(`${salt}${n}`), salt, signature: "s".repeat(64), maxnumber: 5000 };
  };

  it("findet die Zahl und kodiert die Loesung als base64-JSON", async () => {
    const solved = await solveChallenge(challenge(4321));
    expect(solved.number).toBe(4321);
    expect(JSON.parse(atob(encodeSolution(solved)))).toMatchObject({ algorithm: "SHA-256", number: 4321, signature: "s".repeat(64) });
  });

  it("bricht ab, wenn keine Zahl passt", async () => {
    await expect(solveChallenge({ ...challenge(9999), maxnumber: 100 })).rejects.toThrow(/nicht gelöst/);
  });

  it("Server-Pruefung aus: kein Token, keine Aufgabe geholt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ enabled: false })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await captchaToken()).toBeNull();
    expect(await captchaToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/captcha/config");
  });

  it("Server-Pruefung an: holt eine Aufgabe von der eigenen API und loest sie", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("config") ? { enabled: true } : challenge(1234))));
    vi.stubGlobal("fetch", fetchMock);
    const token = await captchaToken();
    expect(JSON.parse(atob(token!)).number).toBe(1234);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/captcha/config", "/api/captcha/challenge"]);
  });
});
