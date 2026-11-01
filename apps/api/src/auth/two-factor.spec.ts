import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { CACHE } from "../cache/cache.module";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { base32Decode, base32Encode, hotp, STEP_SECONDS, stepAt, verifyTotp } from "./totp";

const password = "ein-sehr-langes-passwort";

describe("TOTP (RFC 6238)", () => {
  const secret = Buffer.from("12345678901234567890");
  it("liefert die Testvektoren aus dem RFC (6-stellig)", () => {
    // RFC 6238 Anhang B (SHA-1): Zeit 59 -> 94287082, 1111111109 -> 07081804, 1234567890 -> 89005924
    const at = (t: number) => hotp(secret, Math.floor(t / 30));
    expect(at(59)).toBe("287082");
    expect(at(1111111109)).toBe("081804");
    expect(at(1234567890)).toBe("005924");
  });

  it("Base32 hin und zurueck", () => {
    expect(base32Encode(secret)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").equals(secret)).toBe(true);
    expect(() => base32Decode("0189")).toThrow();
  });

  it("akzeptiert +-1 Schritt, aber nicht mehr; falsches Format wird abgelehnt", () => {
    const s = base32Encode(secret);
    const now = 1_700_000_000_000;
    const code = (offset: number) => hotp(secret, stepAt(now) + offset);
    expect(verifyTotp(s, code(0), now)).toBe(stepAt(now));
    expect(verifyTotp(s, code(-1), now)).toBe(stepAt(now) - 1);
    expect(verifyTotp(s, code(1), now)).toBe(stepAt(now) + 1);
    expect(verifyTotp(s, code(2), now)).toBeNull();
    expect(verifyTotp(s, "12345", now)).toBeNull();
    expect(verifyTotp(s, "abcdef", now)).toBeNull();
    expect(STEP_SECONDS).toBe(30);
  });
});

describe("Zwei-Faktor-Anmeldung", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app.close();
  });

  const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object, cookie?: string) =>
    app.inject({ method, url, payload, headers: cookie ? { cookie } : {} });
  async function signup(name: string) {
    const email = `${name}@example.de`;
    await call("POST", "/auth/register", { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true });
    const login = await call("POST", "/auth/login", { email, password });
    return { email, cookie: String(login.headers["set-cookie"]).split(";")[0] };
  }
  const codeFor = (secretBase32: string, offset = 0) => hotp(base32Decode(secretBase32), stepAt(Date.now()) + offset);

  let me: { email: string; cookie: string };
  let secret: string;
  let recovery: string[];

  it("Status: standardmaessig aus, nur mit Anmeldung", async () => {
    me = await signup("zoe");
    expect((await call("GET", "/auth/2fa")).statusCode).toBe(401);
    expect((await call("GET", "/auth/2fa", undefined, me.cookie)).json()).toEqual({ enabled: false, recoveryCodesLeft: 0 });
  });

  it("Einrichtung: Geheimnis + QR, Aktivierung nur mit gueltigem Code, Notfallcodes einmalig", async () => {
    const setup = await call("POST", "/auth/2fa/setup", undefined, me.cookie);
    expect(setup.statusCode).toBe(200);
    secret = setup.json().secret;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.json().otpauthUrl).toContain("otpauth://totp/Klubnest");
    expect(setup.json().qrSvg).toContain("<svg");
    // Geheimnis liegt verschluesselt in der Datenbank
    const [row] = await db.select().from(schema.userTotp);
    expect(row.secretEnc).not.toContain(secret);
    expect(row.enabledAt).toBeNull();
    // Solange nicht bestaetigt, verlangt die Anmeldung noch keinen Code
    expect((await call("POST", "/auth/login", { email: me.email, password })).json().email).toBe(me.email);

    expect((await call("POST", "/auth/2fa/enable", { code: "000000" }, me.cookie)).statusCode).toBe(400);
    const enabled = await call("POST", "/auth/2fa/enable", { code: codeFor(secret) }, me.cookie);
    expect(enabled.statusCode).toBe(200);
    recovery = enabled.json().recoveryCodes;
    expect(recovery).toHaveLength(10);
    expect(recovery[0]).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
    const hashes = await db.select().from(schema.recoveryCodes);
    expect(hashes.every((h) => !recovery.includes(h.codeHash))).toBe(true);
    expect((await call("GET", "/auth/2fa", undefined, me.cookie)).json()).toEqual({ enabled: true, recoveryCodesLeft: 10 });
    expect((await call("POST", "/auth/2fa/setup", undefined, me.cookie)).statusCode).toBe(409);
  });

  let challenge: string;
  it("Login: Passwort allein reicht nicht, es gibt keine Sitzung, nur eine Herausforderung", async () => {
    const res = await call("POST", "/auth/login", { email: me.email, password });
    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.json().twoFactorRequired).toBe(true);
    challenge = res.json().challenge;
    // falsches Passwort verraet nichts ueber 2FA
    expect((await call("POST", "/auth/login", { email: me.email, password: "falsches-passwort-123" })).statusCode).toBe(401);
  });

  it("zweiter Schritt: falsche/ungueltige Eingaben scheitern, richtiger Code erzeugt die Sitzung, Code gilt nur einmal", async () => {
    expect((await call("POST", "/auth/login/2fa", { challenge: "kaputt.token", code: "123456" })).statusCode).toBe(401);
    const tampered = challenge.slice(0, -3) + (challenge.endsWith("aaa") ? "bbb" : "aaa");
    expect((await call("POST", "/auth/login/2fa", { challenge: tampered, code: codeFor(secret) })).statusCode).toBe(401);
    expect((await call("POST", "/auth/login/2fa", { challenge, code: "000000" })).statusCode).toBe(401);

    const code = codeFor(secret, 1); // ein Schritt voraus (innerhalb der Toleranz) und neuer als der Aktivierungscode
    const ok = await call("POST", "/auth/login/2fa", { challenge, code });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().email).toBe(me.email);
    const cookie = String(ok.headers["set-cookie"]).split(";")[0];
    expect((await call("GET", "/auth/me", undefined, cookie)).statusCode).toBe(200);

    const again = await call("POST", "/auth/login", { email: me.email, password });
    const replay = await call("POST", "/auth/login/2fa", { challenge: again.json().challenge, code });
    expect(replay.statusCode).toBe(401); // derselbe Code ein zweites Mal
  });

  it("Notfallcode funktioniert genau einmal", async () => {
    const first = await call("POST", "/auth/login", { email: me.email, password });
    const used = await call("POST", "/auth/login/2fa", { challenge: first.json().challenge, code: recovery[0].toUpperCase() });
    expect(used.statusCode).toBe(200);
    const second = await call("POST", "/auth/login", { email: me.email, password });
    expect((await call("POST", "/auth/login/2fa", { challenge: second.json().challenge, code: recovery[0] })).statusCode).toBe(401);
    const cookie = String(used.headers["set-cookie"]).split(";")[0];
    expect((await call("GET", "/auth/2fa", undefined, cookie)).json().recoveryCodesLeft).toBe(9);
    me.cookie = cookie;
  });

  it("Deaktivieren und Neu-Erzeugen verlangen Passwort UND Code", async () => {
    const code = () => codeFor(secret, 2);
    expect((await call("POST", "/auth/2fa/disable", { password: "falsch-falsch-123", code: code() }, me.cookie)).statusCode).toBe(401);
    expect((await call("POST", "/auth/2fa/disable", { password, code: "111111" }, me.cookie)).statusCode).toBe(401);
    const regen = await call("POST", "/auth/2fa/recovery-codes", { password, code: recovery[1] }, me.cookie);
    expect(regen.statusCode).toBe(200);
    const fresh = regen.json().recoveryCodes as string[];
    expect(fresh).toHaveLength(10);
    expect(fresh).not.toContain(recovery[2]);
    // alte Notfallcodes sind ungueltig
    const login = await call("POST", "/auth/login", { email: me.email, password });
    expect((await call("POST", "/auth/login/2fa", { challenge: login.json().challenge, code: recovery[2] })).statusCode).toBe(401);

    expect((await call("POST", "/auth/2fa/disable", { password, code: fresh[0] }, me.cookie)).statusCode).toBe(204);
    expect((await call("GET", "/auth/2fa", undefined, me.cookie)).json().enabled).toBe(false);
    expect((await call("POST", "/auth/login", { email: me.email, password })).json().email).toBe(me.email); // wieder nur Passwort
    const log = (await db.select().from(schema.auditLog)).map((l) => l.action);
    for (const a of ["user.2fa.enabled", "user.2fa.recovery.used", "user.2fa.recovery.generated", "user.2fa.disabled"]) expect(log).toContain(a);
  });

  it("Sperre nach 5 falschen Codes (auch der richtige Code hilft dann nicht)", async () => {
    const user = await signup("sperre");
    const s = (await call("POST", "/auth/2fa/setup", undefined, user.cookie)).json().secret as string;
    await call("POST", "/auth/2fa/enable", { code: codeFor(s) }, user.cookie);
    const login = await call("POST", "/auth/login", { email: user.email, password });
    const ch = login.json().challenge as string;
    for (let i = 0; i < 5; i++) expect((await call("POST", "/auth/login/2fa", { challenge: ch, code: "000000" })).statusCode).toBe(401);
    const locked = await call("POST", "/auth/login/2fa", { challenge: ch, code: codeFor(s, 1) });
    expect(locked.statusCode).toBe(429);
    // Cache leeren (Sperre ablaufen lassen) -> der richtige Code geht wieder
    const cache = app.get(CACHE);
    const row = (await db.select().from(schema.users).where(eq(schema.users.email, user.email)))[0];
    await cache.del(`login:2fa:fail:${row.id}`);
    expect((await call("POST", "/auth/login/2fa", { challenge: ch, code: codeFor(s, 1) })).statusCode).toBe(200);
  });

  it("Kontoloeschung entfernt 2FA-Daten", async () => {
    const user = await signup("weg");
    const id = (await call("GET", "/auth/me", undefined, user.cookie)).json().id as string;
    const s = (await call("POST", "/auth/2fa/setup", undefined, user.cookie)).json().secret as string;
    await call("POST", "/auth/2fa/enable", { code: codeFor(s) }, user.cookie);
    expect((await db.select().from(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, id))).length).toBe(10);
    expect((await call("DELETE", "/privacy/account", { password }, user.cookie)).statusCode).toBe(204);
    expect(await db.select().from(schema.userTotp).where(eq(schema.userTotp.userId, id))).toHaveLength(0);
    expect(await db.select().from(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, id))).toHaveLength(0);
  });
});
