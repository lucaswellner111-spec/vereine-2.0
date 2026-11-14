import "reflect-metadata";
import { createHash } from "node:crypto";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CAPTCHA_FAILED_CODE, CAPTCHA_HEADER, type CaptchaChallenge, type CaptchaSolution } from "@vereine/shared";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { CACHE, MemoryCache } from "../cache/cache.module";
import { DB } from "../db/db.module";
import { createTestDb } from "../testing/test-db";
import { CAPTCHA_MAX_NUMBER, CAPTCHA_TTL_S, CaptchaService, captchaEnabled } from "./captcha.service";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** Loest die Aufgabe wie der Browser (Zahl suchen) und kodiert sie fuer den Header. */
function solve(c: CaptchaChallenge, tweak: Partial<CaptchaSolution> = {}): string {
  for (let n = 0; n <= c.maxnumber; n++) {
    if (sha(`${c.salt}${n}`) === c.challenge) {
      const s: CaptchaSolution = { algorithm: c.algorithm, challenge: c.challenge, salt: c.salt, signature: c.signature, number: n, ...tweak };
      return Buffer.from(JSON.stringify(s)).toString("base64");
    }
  }
  throw new Error("nicht loesbar");
}

describe("captchaEnabled", () => {
  it("ohne Angabe nur in Produktion, per Variable umschaltbar", () => {
    expect(captchaEnabled({})).toBe(false);
    expect(captchaEnabled({ NODE_ENV: "production" })).toBe(true);
    expect(captchaEnabled({ NODE_ENV: "production", CAPTCHA_ENFORCE: "false" })).toBe(false);
    expect(captchaEnabled({ CAPTCHA_ENFORCE: "true" })).toBe(true);
  });
});

describe("CaptchaService (Proof-of-Work, HMAC, Einmalverwendung)", () => {
  const svc = new CaptchaService(new MemoryCache());

  it("gueltige Loesung wird genau einmal akzeptiert", async () => {
    const token = solve(svc.createChallenge());
    expect(await svc.verifyAndConsume(token)).toBe(true);
    expect(await svc.verifyAndConsume(token)).toBe(false);
  });

  it("Aufgaben sind verschieden, signiert und tragen ein Ablaufdatum", () => {
    const a = svc.createChallenge();
    const b = svc.createChallenge();
    expect(a.challenge).not.toBe(b.challenge);
    expect(a.maxnumber).toBe(CAPTCHA_MAX_NUMBER);
    expect(a.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(a.salt).toMatch(/\?expires=\d+$/);
  });

  it("abgelaufene Aufgabe wird abgelehnt", async () => {
    const now = Date.now();
    const token = solve(svc.createChallenge(now));
    expect(await svc.verifyAndConsume(token, now + (CAPTCHA_TTL_S + 5) * 1000)).toBe(false);
  });

  it("falsche Zahl, veraenderte Signatur, fremdes Salz und Muell werden abgelehnt (und verbrauchen nichts)", async () => {
    const c = svc.createChallenge();
    const good = solve(c);
    const number = (JSON.parse(Buffer.from(good, "base64").toString()) as CaptchaSolution).number;
    expect(await svc.verifyAndConsume(solve(c, { number: number + 1 }))).toBe(false);
    expect(await svc.verifyAndConsume(solve(c, { signature: "0".repeat(64) }))).toBe(false);
    expect(await svc.verifyAndConsume(solve(c, { salt: `${c.salt}x` }))).toBe(false);
    // Eigenbau-Aufgabe mit gueltigem Hash, aber ohne Server-Signatur
    const salt = `abc?expires=${Math.floor(Date.now() / 1000) + 600}`;
    const own = Buffer.from(JSON.stringify({ algorithm: "SHA-256", challenge: sha(`${salt}5`), salt, signature: "f".repeat(64), number: 5 })).toString("base64");
    expect(await svc.verifyAndConsume(own)).toBe(false);
    for (const junk of [undefined, "", "x", "{}", Buffer.from("[]").toString("base64"), "A".repeat(3000)]) expect(await svc.verifyAndConsume(junk)).toBe(false);
    // die echte Loesung gilt nach den Fehlversuchen noch
    expect(await svc.verifyAndConsume(good)).toBe(true);
  });

  it("faellt der Cache aus, wird nicht zugelassen (fail closed)", async () => {
    const broken = new CaptchaService({ ...new MemoryCache(), setNx: async () => { throw new Error("down"); } } as never);
    expect(await broken.verifyAndConsume(solve(broken.createChallenge()))).toBe(false);
  });
});

describe("Bot-Abwehr an den Formularen", () => {
  let app: NestFastifyApplication;
  let cacheRef: MemoryCache;

  beforeAll(async () => {
    const db = await createTestDb();
    cacheRef = new MemoryCache();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).overrideProvider(CACHE).useValue(cacheRef).compile();
    app = ref.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(() => app.close());
  afterEach(() => {
    delete process.env.CAPTCHA_ENFORCE;
  });

  const post = (url: string, payload: object, captcha?: string, cookie?: string) =>
    app.inject({ method: "POST", url, payload, headers: { ...(captcha ? { [CAPTCHA_HEADER]: captcha } : {}), ...(cookie ? { cookie } : {}) } });
  const challenge = async () => (await app.inject({ method: "GET", url: "/captcha/challenge" })).json() as CaptchaChallenge;
  const register = (email: string, captcha?: string) =>
    post("/auth/register", { email, password: "ein-sehr-langes-passwort", displayName: "Bot Test", confirmAge16: true, acceptTerms: true, acceptPrivacy: true }, captcha);

  it("Konfiguration und Aufgabe sind ohne Anmeldung abrufbar, nie cachebar", async () => {
    expect((await app.inject({ method: "GET", url: "/captcha/config" })).json()).toEqual({ enabled: false });
    process.env.CAPTCHA_ENFORCE = "true";
    expect((await app.inject({ method: "GET", url: "/captcha/config" })).json()).toEqual({ enabled: true });
    const res = await app.inject({ method: "GET", url: "/captcha/challenge" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.json().algorithm).toBe("SHA-256");
  });

  it("aus (Standard in Tests): Formulare brauchen keine Loesung", async () => {
    expect((await register("frei@example.de")).statusCode).toBe(202);
  });

  it("an: Registrierung nur mit frischer, einmaliger Loesung", async () => {
    process.env.CAPTCHA_ENFORCE = "true";
    const none = await register("a1@example.de");
    expect(none.statusCode).toBe(400);
    expect(none.json().code).toBe(CAPTCHA_FAILED_CODE);
    const token = solve(await challenge());
    expect((await register("a2@example.de", token)).statusCode).toBe(202);
    const replay = await register("a3@example.de", token);
    expect(replay.statusCode).toBe(400);
    expect(replay.json().code).toBe(CAPTCHA_FAILED_CODE);
    expect((await register("a4@example.de", "kaputt")).statusCode).toBe(400);
  });

  it("an: Passwort vergessen, Warteliste und Mitgliedsantrag sind ebenfalls geschuetzt", async () => {
    process.env.CAPTCHA_ENFORCE = "true";
    expect((await post("/auth/password/forgot", { email: "x@example.de" })).statusCode).toBe(400);
    expect((await post("/auth/password/forgot", { email: "x@example.de" }, solve(await challenge()))).statusCode).toBe(202);
    const wl = { email: "w@example.de", consent: true, elapsedMs: 5000 };
    expect((await post("/waitlist", wl)).statusCode).toBe(400);
    expect((await post("/waitlist", wl, solve(await challenge()))).statusCode).toBe(202);
    // Mitgliedsantrag: ohne Loesung zuerst Captcha-Fehler, nicht 401/404 (Guard laeuft nach der Anmeldepruefung)
    expect((await post("/orgs/gibt-es-nicht/membership", {})).statusCode).toBe(401);
  });

  it("Schutz gegen Missbrauch der Aufgaben-Ausgabe: Limit je IP und Minute", async () => {
    const limited = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(await createTestDb()).overrideProvider(CACHE).useValue(new MemoryCache()).compile();
    const a = limited.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(a, { rateLimit: false });
    await a.init();
    await a.getHttpAdapter().getInstance().ready();
    let last = 200;
    for (let i = 0; i < 61; i++) last = (await a.inject({ method: "GET", url: "/captcha/challenge", remoteAddress: "198.51.100.7" })).statusCode;
    expect(last).toBe(429);
    await a.close();
  });
});
