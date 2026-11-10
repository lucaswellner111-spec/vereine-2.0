import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WAITLIST_CHECK_INBOX, WAITLIST_CONSENT_VERSION } from "@vereine/shared";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { AuthService } from "../auth/auth.service";
import { CACHE, type Cache } from "../cache/cache.module";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { addressHash } from "../mail/mail-limits";
import { MemoryMailDriver } from "../mail/mail.drivers";
import { MAIL_DRIVER } from "../mail/mail.service";
import { RetentionService } from "../privacy/retention.service";
import { confirmEmailForTest } from "../testing/auth";
import { createTestDb, type TestDb } from "../testing/test-db";
import { WAITLIST_SIGNUPS_PER_IP_HOUR } from "./waitlist-rate-limit.guard";
import { csvCell, WaitlistService } from "./waitlist.service";

const tokenOf = (text: string) => /#t=([A-Za-z0-9_.-]+)/.exec(text)?.[1] ?? "";
const confirmTokenOf = (text: string) => /warteliste\/bestaetigen#t=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";
const removeTokenOf = (text: string) => /warteliste\/austragen#t=([A-Za-z0-9_.-]+)/.exec(text)?.[1] ?? "";
const password = "ein-sehr-langes-passwort";

describe("Warteliste", () => {
  let app: NestFastifyApplication;
  let db: TestDb;
  let cache: Cache;
  const mails = new MemoryMailDriver();
  let ipCounter = 0;

  beforeAll(async () => {
    db = await createTestDb();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).overrideProvider(MAIL_DRIVER).useValue(mails).compile();
    app = ref.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    cache = app.get(CACHE);
  });
  afterAll(() => app.close());
  beforeEach(() => mails.clear());

  /** Je Aufruf eine eigene IP (sonst greift das IP-Limit testuebergreifend), ausser sie wird vorgegeben. */
  const post = (url: string, payload: object, ip = `10.0.0.${++ipCounter % 250}`) => app.inject({ method: "POST", url, payload, remoteAddress: ip });
  const form = (email: string, extra: object = {}) => ({ email, orgName: "SV Grün", city: "Musterstadt", orgType: "Sport", role: "vorstand", consent: true, ...extra });
  const resetAddressLimit = (email: string) => cache.del(`lim:wl:addr:10m:${addressHash(email)}`);
  const entry = async (email: string) => (await db.select().from(schema.waitlistEntries).where(eq(schema.waitlistEntries.email, email)))[0];

  it("Anmelden: neutrale Antwort, Mail mit Einmal-Link, Token nur als Hash, Einwilligung mit Version und Zeitpunkt", async () => {
    const res = await post("/waitlist", form("Vera@Example.de"));
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ message: WAITLIST_CHECK_INBOX });
    const mail = mails.last("vera@example.de", "waitlist-confirm")!;
    expect(mail.text).toContain("http://localhost:3000/warteliste/bestaetigen#t=");
    expect(mail.text).toContain("/warteliste/austragen#t=");
    const token = confirmTokenOf(mail.text);
    const row = await entry("vera@example.de");
    expect(row).toMatchObject({ status: "pending", orgName: "SV Grün", city: "Musterstadt", orgType: "Sport", role: "vorstand", consentVersion: WAITLIST_CONSENT_VERSION });
    expect(row.consentAt).toBeInstanceOf(Date);
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenExpiresAt!.getTime() - Date.now()).toBeGreaterThan(47 * 3600_000);

    const ok = await post("/waitlist/confirm", { token });
    expect(ok.statusCode).toBe(204);
    expect(await entry("vera@example.de")).toMatchObject({ status: "confirmed", tokenHash: null });
    expect((await entry("vera@example.de")).confirmedAt).toBeInstanceOf(Date);
    // einmalig
    expect((await post("/waitlist/confirm", { token })).statusCode).toBe(400);
  });

  it("bekannte, bestaetigte Adresse: gleiche Antwort, nur Hinweismail, Angaben bleiben", async () => {
    await resetAddressLimit("vera@example.de");
    const res = await post("/waitlist", form("vera@example.de", { orgName: "Fremder Name" }));
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ message: WAITLIST_CHECK_INBOX });
    expect(mails.last("vera@example.de", "waitlist-confirm")).toBeUndefined();
    expect(mails.last("vera@example.de", "waitlist-exists")).toBeTruthy();
    expect((await entry("vera@example.de")).orgName).toBe("SV Grün");
  });

  it("Pflichtfelder, Einwilligung und Laengen per Zod; generische Fehler", async () => {
    expect((await post("/waitlist", form("x@example.de", { consent: false }))).statusCode).toBe(400);
    expect((await post("/waitlist", { email: "x@example.de", orgName: "SV" })).statusCode).toBe(400);
    expect((await post("/waitlist", form("keine-adresse"))).statusCode).toBe(400);
    expect((await post("/waitlist", form("x@example.de", { orgName: "A".repeat(121) }))).statusCode).toBe(400);
    expect((await post("/waitlist", form("x@example.de", { city: "B".repeat(81) }))).statusCode).toBe(400);
    expect((await post("/waitlist", form("x@example.de", { role: "chef" }))).statusCode).toBe(400);
    expect((await post("/waitlist", form("x@example.de", { orgName: "SV\u0000Grün" }))).statusCode).toBe(400);
    expect((await post("/waitlist/confirm", { token: "kurz" })).statusCode).toBe(400);
    expect(await entry("x@example.de")).toBeUndefined();
  });

  it("Honeypot: gleiche Antwort, aber kein Eintrag und keine Mail", async () => {
    const res = await post("/waitlist", form("bot@example.de", { website: "https://spam.example" }));
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ message: WAITLIST_CHECK_INBOX });
    expect(await entry("bot@example.de")).toBeUndefined();
    expect(mails.sent).toHaveLength(0);
  });

  it("abgelaufener Link (48 h) gilt nicht; erneutes Anmelden ersetzt den Link", async () => {
    await post("/waitlist", form("alt@example.de"));
    const first = confirmTokenOf(mails.last("alt@example.de", "waitlist-confirm")!.text);
    await db.update(schema.waitlistEntries).set({ tokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.waitlistEntries.email, "alt@example.de"));
    expect((await post("/waitlist/confirm", { token: first })).statusCode).toBe(400);

    await resetAddressLimit("alt@example.de");
    await post("/waitlist", form("alt@example.de", { orgName: "TSV Neu" }));
    const second = confirmTokenOf(mails.last("alt@example.de", "waitlist-confirm")!.text);
    expect(second).not.toBe(first);
    expect((await post("/waitlist/confirm", { token: first })).statusCode).toBe(400);
    expect((await post("/waitlist/confirm", { token: second })).statusCode).toBe(204);
    expect(await entry("alt@example.de")).toMatchObject({ status: "confirmed", orgName: "TSV Neu" });
  });

  it("Austragen per Link aus jeder Mail: Eintrag weg, wiederholbar, gefaelschter Link 400", async () => {
    await post("/waitlist", form("weg@example.de"));
    const remove = removeTokenOf(mails.last("weg@example.de", "waitlist-confirm")!.text);
    expect(remove).toMatch(/^[0-9a-f-]{36}\./);
    const [id] = remove.split(".");
    expect((await post("/waitlist/remove", { token: `${id}.${"A".repeat(43)}` })).statusCode).toBe(400);
    expect(await entry("weg@example.de")).toBeTruthy();
    expect((await post("/waitlist/remove", { token: remove })).statusCode).toBe(204);
    expect(await entry("weg@example.de")).toBeUndefined();
    expect((await post("/waitlist/remove", { token: remove })).statusCode).toBe(204);

    // auch der Hinweis an bestaetigte Adressen traegt den Austragelink
    await post("/waitlist", form("weg2@example.de"));
    await post("/waitlist/confirm", { token: confirmTokenOf(mails.last("weg2@example.de", "waitlist-confirm")!.text) });
    await resetAddressLimit("weg2@example.de");
    await post("/waitlist", form("weg2@example.de"));
    const notice = mails.last("weg2@example.de", "waitlist-exists")!;
    expect((await post("/waitlist/remove", { token: removeTokenOf(notice.text) })).statusCode).toBe(204);
    expect(await entry("weg2@example.de")).toBeUndefined();
  });

  it("Limits je Adresse: 1 Mail je 10 Minuten, 3 je Tag; Antwort bleibt gleich", async () => {
    const email = "limit@example.de";
    expect((await post("/waitlist", form(email))).statusCode).toBe(202);
    expect((await post("/waitlist", form(email))).statusCode).toBe(202); // innerhalb von 10 Minuten: keine zweite Mail
    expect(mails.sent.filter((m) => m.to === email)).toHaveLength(1);
    await resetAddressLimit(email);
    await post("/waitlist", form(email));
    await resetAddressLimit(email);
    await post("/waitlist", form(email));
    await resetAddressLimit(email);
    const fourth = await post("/waitlist", form(email)); // Tageslimit erreicht
    expect(fourth.statusCode).toBe(202);
    expect(fourth.json()).toEqual({ message: WAITLIST_CHECK_INBOX });
    expect(mails.sent.filter((m) => m.to === email)).toHaveLength(3);
  });

  it("Rate-Limit je IP: nach 10 Anmeldungen pro Stunde 429", async () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < WAITLIST_SIGNUPS_PER_IP_HOUR; i++) expect((await post("/waitlist", form(`ip${i}@example.de`), ip)).statusCode).toBe(202);
    const blocked = await post("/waitlist", form("ip-x@example.de"), ip);
    expect(blocked.statusCode).toBe(429);
    expect(await entry("ip-x@example.de")).toBeUndefined();
    expect((await post("/waitlist", form("ip-y@example.de"), "203.0.113.10")).statusCode).toBe(202);
  });

  it("purgeExpired: unbestaetigte Eintraege nach 7 Tagen weg, bestaetigte bleiben (Job privacy.retention)", async () => {
    await post("/waitlist", form("alt-pending@example.de"));
    const old = new Date(Date.now() - 8 * 86400_000);
    await db.update(schema.waitlistEntries).set({ requestedAt: old }).where(eq(schema.waitlistEntries.email, "alt-pending@example.de"));
    await db.update(schema.waitlistEntries).set({ requestedAt: old }).where(eq(schema.waitlistEntries.email, "vera@example.de"));
    const result = await app.get(RetentionService).runAll();
    expect(result.waitlist).toBeGreaterThanOrEqual(1);
    expect(await entry("alt-pending@example.de")).toBeUndefined();
    expect(await entry("vera@example.de")).toMatchObject({ status: "confirmed" });
    expect(await entry("limit@example.de")).toMatchObject({ status: "pending" }); // juenger als 7 Tage
  });

  describe("Betreiber-Sicht /platform/waitlist", () => {
    let root: string;
    let normal: string;
    async function signupUser(email: string) {
      await app.inject({ method: "POST", url: "/auth/register", payload: { email, password, displayName: "Betrieb", confirmAge16: true, acceptTerms: true, acceptPrivacy: true } });
      await confirmEmailForTest(app, email);
      const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
      return String(login.headers["set-cookie"]).split(";")[0];
    }
    beforeAll(async () => {
      root = await signupUser("root-wl@example.de");
      normal = await signupUser("normal-wl@example.de");
      await app.get(AuthService).setPlatformAdmin("root-wl@example.de", true);
      // Formel-Injection im Vereinsnamen
      await post("/waitlist", form("formel@example.de", { orgName: "=HYPERLINK(\"x\")", city: "+49 Stadt", orgType: "@Sport" }));
      await post("/waitlist/confirm", { token: confirmTokenOf(mails.last("formel@example.de", "waitlist-confirm")!.text) });
    });
    const get = (url: string, cookie?: string) => app.inject({ method: "GET", url, headers: cookie ? { cookie } : {} });

    it("anonym 401, normales Konto 403", async () => {
      expect((await get("/platform/waitlist")).statusCode).toBe(401);
      expect((await get("/platform/waitlist", normal)).statusCode).toBe(403);
      expect((await get("/platform/waitlist.csv", normal)).statusCode).toBe(403);
    });

    it("Liste und Zaehler nur bestaetigter Eintraege, Zugriff protokolliert", async () => {
      const res = await get("/platform/waitlist", root);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.confirmed).toBe(body.entries.length);
      expect(body.pending).toBeGreaterThanOrEqual(1);
      expect(body.entries.map((e: { email: string }) => e.email)).toContain("formel@example.de");
      expect(body.entries.map((e: { email: string }) => e.email)).not.toContain("limit@example.de");
      expect(JSON.stringify(body)).not.toMatch(/token/i);
      const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "platform.waitlist.viewed"));
      expect(audit).toHaveLength(1);
      expect(JSON.stringify(audit[0].meta)).not.toContain("@");
    });

    it("CSV-Export: Formel-Injection mit ' entschaerft, protokolliert", async () => {
      const res = await get("/platform/waitlist.csv", root);
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["cache-control"]).toContain("no-store");
      const line = res.body.split("\r\n").find((l) => l.startsWith("formel@example.de"))!;
      expect(line).toContain(`"'=HYPERLINK(""x"")"`);
      expect(line).toContain("'+49 Stadt");
      expect(line).toContain("'@Sport");
      expect(csvCell("-1")).toBe("'-1");
      expect(csvCell("Normal")).toBe("Normal");
      expect(await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "platform.waitlist.exported"))).toHaveLength(1);
    });
  });

  it("Datenauskunft und Kontoloeschung beruecksichtigen den Eintrag mit der Kontoadresse", async () => {
    const svc = app.get(WaitlistService);
    expect(await svc.exportFor("VERA@example.de")).toEqual([expect.objectContaining({ orgName: "SV Grün", status: "confirmed", consentVersion: WAITLIST_CONSENT_VERSION })]);
    expect(JSON.stringify(await svc.exportFor("vera@example.de"))).not.toMatch(/tokenHash/);
    await svc.eraseFor("vera@example.de");
    expect(await entry("vera@example.de")).toBeUndefined();
    expect(tokenOf("x#t=abc")).toBe("abc");
  });
});
