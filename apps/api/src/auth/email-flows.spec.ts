import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { MemoryMailDriver } from "../mail/mail.drivers";
import { MAIL_DRIVER } from "../mail/mail.service";
import { DigestService } from "../notifications/digest.service";
import { RetentionService } from "../privacy/retention.service";
import { createTestDb, type TestDb } from "../testing/test-db";

const password = "ein-sehr-langes-passwort";
const reg = (email: string, displayName = "Neu", pw = password) => ({ email, password: pw, displayName, confirmAge16: true, acceptTerms: true, acceptPrivacy: true });
const tokenOf = (text: string) => /#t=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";

describe("E-Mail-Ablaeufe", () => {
  let app: NestFastifyApplication;
  let db: TestDb;
  const mails = new MemoryMailDriver();

  beforeAll(async () => {
    db = await createTestDb();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).overrideProvider(MAIL_DRIVER).useValue(mails).compile();
    app = ref.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(() => app.close());
  beforeEach(() => mails.clear());

  const post = (url: string, payload: object, cookie?: string, ip?: string) =>
    app.inject({ method: "POST", url, payload, headers: cookie ? { cookie } : {}, ...(ip ? { remoteAddress: ip } : {}) });
  const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers["set-cookie"] ?? "").split(";")[0];

  /** Registrieren und ueber den Link aus der Mail bestaetigen (meldet an). */
  async function signup(email: string, name = "Neu") {
    await post("/auth/register", reg(email, name));
    const res = await post("/auth/email/confirm", { token: tokenOf(mails.last(email, "verify-email")!.text) });
    return { cookie: cookieOf(res), id: res.json().user.id as string };
  }

  it("Registrierung: Bestaetigungslink per Mail, Token nur als Hash, Anmelden erst nach Bestaetigung", async () => {
    const res = await post("/auth/register", reg("Lea@Example.de", "Lea"));
    expect(res.statusCode).toBe(202);
    const mail = mails.last("lea@example.de", "verify-email")!;
    expect(mail.text).toMatch(/http:\/\/localhost:3000\/email-bestaetigen#t=/);
    const token = tokenOf(mail.text);
    const stored = await db.select().from(schema.authTokens);
    expect(stored.some((t) => t.tokenHash === token)).toBe(false);
    expect(stored[0]).toMatchObject({ purpose: "verify" });

    // Vor der Bestaetigung: exakt dieselbe Antwort wie ein falsches Passwort
    const early = await post("/auth/login", { email: "lea@example.de", password });
    const wrong = await post("/auth/login", { email: "lea@example.de", password: "falsch-falsch-falsch" });
    expect(early.statusCode).toBe(401);
    expect(early.json()).toEqual(wrong.json());

    const confirm = await post("/auth/email/confirm", { token });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json()).toMatchObject({ loggedIn: true, changed: false, user: { email: "lea@example.de", emailVerified: true } });
    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: cookieOf(confirm) } });
    expect(me.json().emailVerified).toBe(true);
    // Einmalig
    expect((await post("/auth/email/confirm", { token })).statusCode).toBe(400);
    expect((await post("/auth/login", { email: "lea@example.de", password })).statusCode).toBe(200);
  });

  it("vorhandene Adresse: gleiche Antwort, Hinweis-Mail statt Bestaetigung, Passwort bleibt", async () => {
    await signup("da@example.de", "Da");
    mails.clear();
    const res = await post("/auth/register", reg("da@example.de", "Fremd", "anderes-langes-passwort"));
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ message: "Prüfe dein Postfach." });
    expect(mails.sent.map((m) => m.template)).toEqual(["account-exists"]);
    expect(mails.sent[0].text).toContain("/passwort-vergessen");
    expect((await post("/auth/login", { email: "da@example.de", password: "anderes-langes-passwort" })).statusCode).toBe(401);
    expect((await post("/auth/login", { email: "da@example.de", password })).statusCode).toBe(200);
  });

  describe("Angriff: spaetere Registrierung derselben unbestaetigten Adresse", () => {
    const victimPw = "passwort-des-opfers-123";
    const attackerPw = "passwort-des-angreifers-9";

    /** Opfer registriert, danach der Angreifer. Liefert beide Links aus dem Postfach des Opfers. */
    async function scenario(email: string) {
      await post("/auth/register", reg(email, "Opfer", victimPw));
      const verifyLink = tokenOf(mails.last(email, "verify-email")!.text);
      const [before] = await db.select().from(schema.users).where(eq(schema.users.email, email));
      const attack = await post("/auth/register", reg(email, "Angreifer", attackerPw));
      expect(attack.statusCode).toBe(202);
      expect(attack.json()).toEqual({ message: "Prüfe dein Postfach." });
      // Keine zweite Bestaetigungsmail, sondern "Registrierung abschliessen" mit Passwort-festlegen-Link (ohne Namen)
      const complete = mails.last(email, "registration-complete")!;
      expect(complete.text).toMatch(/\/passwort-neu#t=/);
      expect(complete.text).not.toContain("Angreifer");
      expect(mails.sent.filter((m) => m.template === "verify-email")).toHaveLength(1);
      // Konto unveraendert, Angreifer-Passwort nirgends gespeichert
      const [after] = await db.select().from(schema.users).where(eq(schema.users.email, email));
      expect(after).toMatchObject({ passwordHash: before.passwordHash, displayName: "Opfer", pendingVerification: true });
      const tokens = await db.select().from(schema.authTokens).where(eq(schema.authTokens.userId, before.id));
      expect(tokens.map((t) => t.purpose).sort()).toEqual(["reset", "verify"]);
      expect((await post("/auth/login", { email, password: attackerPw })).statusCode).toBe(401);
      return { verifyLink, completeLink: tokenOf(complete.text), userId: before.id };
    }

    it("Opfer oeffnet den urspruenglichen Bestaetigungslink: eigenes Passwort gilt, Angreifer-Passwort nie", async () => {
      const email = "opfer1@example.de";
      const { verifyLink, completeLink } = await scenario(email);
      const ok = await post("/auth/email/confirm", { token: verifyLink });
      expect(ok.json()).toMatchObject({ loggedIn: true, user: { displayName: "Opfer", emailVerified: true } });
      expect((await post("/auth/login", { email, password: attackerPw })).statusCode).toBe(401);
      expect((await post("/auth/login", { email, password: victimPw })).statusCode).toBe(200);
      // Der "Passwort festlegen"-Link bleibt ein normaler Reset-Link der Adresse (nur im Postfach des Opfers)
      expect((await post("/auth/password/reset", { token: completeLink, newPassword: attackerPw })).statusCode).toBeLessThan(300);
    });

    it("Opfer oeffnet die neueste Mail (Passwort festlegen): legt das Passwort selbst fest, Adresse bestaetigt", async () => {
      const email = "opfer2@example.de";
      const { verifyLink, completeLink } = await scenario(email);
      const ownPw = "selbst-gewaehltes-passwort";
      const res = await post("/auth/password/reset", { token: completeLink, newPassword: ownPw });
      expect(res.statusCode).toBeLessThan(300);
      expect((await post("/auth/login", { email, password: attackerPw })).statusCode).toBe(401);
      expect((await post("/auth/login", { email, password: victimPw })).statusCode).toBe(401);
      const login = await post("/auth/login", { email, password: ownPw });
      expect(login.statusCode).toBe(200);
      expect(login.json().emailVerified).toBe(true);
      const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
      expect(u.pendingVerification).toBe(false);
      expect(u.emailVerifiedAt).not.toBeNull();
      // Der alte Bestaetigungslink ist danach entwertet
      expect((await post("/auth/email/confirm", { token: verifyLink })).statusCode).toBe(400);
    });
  });

  it("Passwort vergessen auf ein unbestaetigtes Konto: setzt das Passwort und bestaetigt die Adresse", async () => {
    const email = "vergessen-pending@example.de";
    await post("/auth/register", reg(email));
    await post("/auth/password/forgot", { email });
    const link = tokenOf(mails.last(email, "password-reset")!.text);
    expect((await post("/auth/password/reset", { token: link, newPassword: "ganz-neues-passwort-1" })).statusCode).toBeLessThan(300);
    const login = await post("/auth/login", { email, password: "ganz-neues-passwort-1" });
    expect(login.statusCode).toBe(200);
    expect(login.json().emailVerified).toBe(true);
  });
  it("abgelaufener Link ist ungueltig (generische Meldung)", async () => {
    await post("/auth/register", reg("alt@example.de"));
    const token = tokenOf(mails.last("alt@example.de")!.text);
    await db.update(schema.authTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await post("/auth/email/confirm", { token });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("Der Link ist ungültig oder abgelaufen.");
  });

  it("unbestaetigtes Konto (Altbestand): kein Verein, keine Einladung; Link erneut senden bestaetigt ohne neue Sitzung", async () => {
    const u = await signup("altbestand@example.de", "Alt");
    await db.update(schema.users).set({ emailVerifiedAt: null }).where(eq(schema.users.email, "altbestand@example.de"));
    await app.get(DB).delete(schema.sessions).where(eq(schema.sessions.userId, u.id)); // Sitzungs-Cache leeren: neu anmelden
    const login = await post("/auth/login", { email: "altbestand@example.de", password });
    const cookie = cookieOf(login);
    expect(login.json().emailVerified).toBe(false);
    const org = await post("/orgs", { name: "SV Ungeprueft", category: "Sport", city: "Stadt" }, cookie);
    expect(org.statusCode).toBe(403);
    expect(org.json().message).toBe("Bitte bestätige zuerst deine E-Mail-Adresse.");
    expect((await post("/auth/email/resend", {}, cookie)).statusCode).toBe(204);
    const confirm = await post("/auth/email/confirm", { token: tokenOf(mails.last("altbestand@example.de", "verify-email")!.text) }, cookie);
    expect(confirm.json()).toMatchObject({ loggedIn: false, user: { emailVerified: true } });
    expect(confirm.headers["set-cookie"]).toBeUndefined();
    expect((await post("/orgs", { name: "SV Geprueft", category: "Sport", city: "Stadt" }, cookie)).statusCode).toBe(201);
  });

  it("Passwort vergessen: immer 202, Link 1 h und einmalig, danach alle Sitzungen beendet", async () => {
    const u = await signup("vergessen@example.de", "Vera");
    const other = cookieOf(await post("/auth/login", { email: "vergessen@example.de", password }));
    const unknown = await post("/auth/password/forgot", { email: "niemand@example.de" });
    const known = await post("/auth/password/forgot", { email: "vergessen@example.de" });
    expect(unknown.statusCode).toBe(202);
    expect(known.json()).toEqual(unknown.json());
    expect(mails.last("niemand@example.de")).toBeUndefined();
    const mail = mails.last("vergessen@example.de", "password-reset")!;
    expect(mail.text).toContain("60 Minuten");
    const token = tokenOf(mail.text);
    const [row] = await db.select().from(schema.authTokens).where(eq(schema.authTokens.purpose, "reset"));
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeLessThanOrEqual(60 * 60_000 + 5000);

    expect((await post("/auth/password/reset", { token, newPassword: "kurz" })).statusCode).toBe(400);
    expect((await post("/auth/password/reset", { token, newPassword: "ganz-neues-langes-passwort" })).statusCode).toBe(204);
    expect((await post("/auth/password/reset", { token, newPassword: "noch-ein-neues-passwort" })).statusCode).toBe(400);
    for (const c of [u.cookie, other]) expect((await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: c } })).statusCode).toBe(401);
    expect((await post("/auth/login", { email: "vergessen@example.de", password })).statusCode).toBe(401);
    expect((await post("/auth/login", { email: "vergessen@example.de", password: "ganz-neues-langes-passwort" })).statusCode).toBe(200);
  });

  it("Limits: je Adresse 3 Mails pro Stunde (still), je IP 5 pro Stunde (429)", async () => {
    for (let i = 0; i < 5; i++) await post("/auth/password/forgot", { email: "viel@example.de" });
    expect(mails.sent).toHaveLength(0); // Konto gibt es nicht
    await signup("limit@example.de");
    mails.clear();
    for (let i = 0; i < 4; i++) expect((await post("/auth/password/forgot", { email: "limit@example.de" })).statusCode).toBe(202);
    expect(mails.sent.filter((m) => m.template === "password-reset")).toHaveLength(2); // 1 Bestaetigung + 2 = 3 je Stunde
    const ip = "198.51.100.9";
    for (let i = 0; i < 5; i++) expect((await post("/auth/password/forgot", { email: `x${i}@example.de` }, undefined, ip)).statusCode).toBe(202);
    expect((await post("/auth/password/forgot", { email: "x9@example.de" }, undefined, ip)).statusCode).toBe(429);
  });

  it("E-Mail aendern: Bestaetigung an neu, Hinweis an alt; erst nach Klick gilt die neue Adresse", async () => {
    const u = await signup("wechsel@example.de", "Wanda");
    mails.clear();
    expect((await post("/auth/email/change", { newEmail: "neu-wanda@example.de", password: "falsch-falsch" }, u.cookie)).statusCode).toBe(401);
    expect((await post("/auth/email/change", { newEmail: "wechsel@example.de", password }, u.cookie)).statusCode).toBe(400);
    const res = await post("/auth/email/change", { newEmail: "Neu-Wanda@Example.de", password }, u.cookie);
    expect(res.statusCode).toBe(202);
    const notice = mails.last("wechsel@example.de", "email-change-notice")!;
    expect(notice.text).toContain("n***@example.de");
    expect(notice.text).not.toContain("neu-wanda@example.de");
    const confirmMail = mails.last("neu-wanda@example.de", "email-change-confirm")!;
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: u.cookie } })).json().email).toBe("wechsel@example.de");
    const ok = await post("/auth/email/confirm", { token: tokenOf(confirmMail.text) });
    expect(ok.json()).toMatchObject({ changed: true, loggedIn: false, user: { email: "neu-wanda@example.de", emailVerified: true } });
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: u.cookie } })).json().email).toBe("neu-wanda@example.de");
    expect((await post("/auth/login", { email: "neu-wanda@example.de", password })).statusCode).toBe(200);
  });

  it("E-Mail aendern auf vergebene Adresse: gleiche Antwort, keine Mail an die vergebene Adresse", async () => {
    await signup("belegt@example.de");
    const u = await signup("sucher@example.de");
    mails.clear();
    const res = await post("/auth/email/change", { newEmail: "belegt@example.de", password }, u.cookie);
    expect(res.statusCode).toBe(202);
    expect(mails.last("belegt@example.de")).toBeUndefined();
    expect(mails.sent.map((m) => m.template)).toEqual(["email-change-notice"]);
  });

  it("E-Mail aendern: IP-Limit greift schon vor der Passwortpruefung", async () => {
    const u = await signup("rater@example.de");
    const ip = "203.0.113.77";
    for (let i = 0; i < 5; i++) {
      expect((await post("/auth/email/change", { newEmail: `x${i}@example.de`, password: "falsch-falsch" }, u.cookie, ip)).statusCode).toBe(401);
    }
    expect((await post("/auth/email/change", { newEmail: "x9@example.de", password: "falsch-falsch" }, u.cookie, ip)).statusCode).toBe(429);
  });

  it("Einladung per Mail: nur Vorstand mit bestaetigter Adresse, Link + Abmelde-Header, Abmeldung wirkt still", async () => {
    const vera = await signup("vorstand-mail@example.de", "Vera");
    const kai = await signup("kai-mail@example.de", "Kai");
    await post("/orgs", { name: "SV Mailtest", category: "Sport", city: "Stadt" }, vera.cookie);
    const invite = (await post("/orgs/sv-mailtest/invites", {}, vera.cookie)).json();
    mails.clear();
    expect((await post(`/orgs/sv-mailtest/invites/${invite.id}/mail`, { email: "gast@example.de" }, kai.cookie)).statusCode).toBe(403);
    expect((await post(`/orgs/sv-mailtest/invites/${invite.id}/mail`, { email: "kein-mail" }, vera.cookie)).statusCode).toBe(400);
    expect((await post(`/orgs/sv-mailtest/invites/${invite.id}/mail`, { email: "Gast@Example.de" }, vera.cookie)).statusCode).toBe(202);
    const mail = mails.last("gast@example.de", "invite")!;
    expect(mail.text).toContain(`/einladung/${invite.token}`);
    expect(mail.text).toContain("Vera");
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const oneClick = /<http:\/\/localhost:3000\/api(\/mail\/unsubscribe\?t=[^>]+)>/.exec(mail.headers!["List-Unsubscribe"])![1];
    // Adresse wird nirgends gespeichert, auch nicht im Protokoll
    expect(JSON.stringify(await db.select().from(schema.auditLog))).not.toContain("gast@");
    // Ein-Klick-Abmeldung aus dem Mailprogramm (Formular-Body nach RFC 8058)
    const unsub = await app.inject({ method: "POST", url: oneClick, payload: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(unsub.statusCode).toBe(200);
    expect(unsub.json()).toEqual({ kind: "invite" });
    mails.clear();
    expect((await post(`/orgs/sv-mailtest/invites/${invite.id}/mail`, { email: "gast@example.de" }, vera.cookie)).statusCode).toBe(202);
    expect(mails.sent).toHaveLength(0);
    expect((await post("/mail/unsubscribe", { token: "kaputt.kaputt" })).statusCode).toBe(400);
  });

  it("neue Rechnung: Mail mit Link, ohne Anhang", async () => {
    const vera = await signup("kasse-mail@example.de", "Vera");
    const mia = await signup("mia-mail@example.de", "Mia");
    await post("/orgs", { name: "SV Rechnungsmail", category: "Sport", city: "Stadt" }, vera.cookie);
    await post("/orgs/sv-rechnungsmail/membership", {}, mia.cookie);
    await post(`/orgs/sv-rechnungsmail/members/${mia.id}/decision`, { decision: "approve" }, vera.cookie);
    const due = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
    const inv = await post("/orgs/sv-rechnungsmail/invoices", { recipientUserId: mia.id, dueDate: due, items: [{ description: "Beitrag", quantity: 1, unitCents: 4800, vatRate: 0 }] }, vera.cookie);
    expect(inv.statusCode).toBe(201);
    mails.clear();
    expect((await post(`/invoices/${inv.json().id}/finalize`, {}, vera.cookie)).statusCode).toBe(201);
    const mail = mails.last("mia-mail@example.de", "invoice-new")!;
    expect(mail.text).toContain("48,00");
    expect(mail.text).toContain("http://localhost:3000/rechnungen");
    expect(mail).not.toHaveProperty("attachments");
  });

  it("Sammelmail: nur mit Opt-in, nur Anzahlen ohne Namen, Abmelden per Link ohne Login", async () => {
    const lena = await signup("digest@example.de", "Lena");
    const fremd = await signup("kommentiert@example.de", "Fritz Fremd");
    expect((await app.inject({ method: "GET", url: "/notifications/email-prefs", headers: { cookie: lena.cookie } })).json()).toMatchObject({ digest: false, available: true });
    const put = await app.inject({ method: "PUT", url: "/notifications/email-prefs", payload: { digest: true }, headers: { cookie: lena.cookie } });
    expect(put.json()).toMatchObject({ digest: true, available: true });
    // Benachrichtigungen nach dem Einschalten, die Sammelmail von gestern liegt zurueck
    await db.update(schema.notificationPrefs).set({ lastDigestAt: new Date(Date.now() - 2 * 86400_000), digestSince: new Date(Date.now() - 2 * 86400_000) });
    await db.insert(schema.notifications).values([
      { userId: lena.id, type: "comment", data: { commenter: "Fritz Fremd", excerpt: "Geheimer Text" }, actorId: fremd.id },
      { userId: lena.id, type: "comment", data: { commenter: "Fritz Fremd", excerpt: "Noch einer" }, actorId: fremd.id },
      { userId: lena.id, type: "event_created", data: { title: "Training" } },
      { userId: lena.id, type: "post_like", data: { name: "Fritz Fremd" } },
    ]);
    mails.clear();
    const digest = app.get(DigestService);
    expect(await digest.run(true)).toBe(1);
    const mail = mails.last("digest@example.de", "notification-digest")!;
    expect(mail.text).toContain("2 neue Kommentare");
    expect(mail.text).toContain("1 Neuigkeit zu Terminen");
    for (const bad of ["Fritz", "Geheimer", "Training", "Like", "like"]) expect(mail.text).not.toContain(bad);
    expect(mail.headers?.["List-Unsubscribe"]).toMatch(/unsubscribe\?t=/);
    // Heute nicht noch einmal
    expect(await digest.run(true)).toBe(0);
    // Ohne Opt-in nie eine Mail (Fritz hat Benachrichtigungen, aber keine Einstellung)
    expect(mails.last("kommentiert@example.de")).toBeUndefined();
    // Abmelden ueber die Web-Seite (JSON, ohne Login)
    const token = /abmelden#t=([^\s]+)/.exec(mail.text)![1];
    const res = await post("/mail/unsubscribe", { token });
    expect(res.json()).toEqual({ kind: "digest" });
    expect((await app.inject({ method: "GET", url: "/notifications/email-prefs", headers: { cookie: lena.cookie } })).json().digest).toBe(false);
  });

  it("Sammelmail einschalten verlangt eine bestaetigte Adresse", async () => {
    const u = await signup("ohne-bestaetigung@example.de");
    await db.update(schema.users).set({ emailVerifiedAt: null }).where(eq(schema.users.id, u.id));
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
    const cookie = cookieOf(await post("/auth/login", { email: "ohne-bestaetigung@example.de", password }));
    const res = await app.inject({ method: "PUT", url: "/notifications/email-prefs", payload: { digest: true }, headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it("Datenauskunft enthaelt Bestaetigungsstatus, Mail-Einstellungen und Sperrliste; keine Token-Hashes", async () => {
    const u = await signup("auskunft-mail@example.de");
    await post("/auth/email/change", { newEmail: "auskunft-neu@example.de", password }, u.cookie);
    const exp = (await app.inject({ method: "GET", url: "/privacy/export", headers: { cookie: u.cookie } })).json();
    expect(exp.email).toMatchObject({ pendingEmailChange: "auskunft-neu@example.de" });
    expect(exp.email.emailVerifiedAt).toBeTruthy();
    expect(exp.emailSettings).toMatchObject({ emailDigest: false });
    expect(exp.mailSuppressions).toEqual([]);
    const hashes = (await db.select().from(schema.authTokens)).map((t) => t.tokenHash);
    for (const h of hashes) expect(JSON.stringify(exp)).not.toContain(h);
  });

  it("Aufraeumen: alte Links nach 7 Tagen, nie bestaetigte Registrierungen nach 7 Tagen geloescht", async () => {
    await post("/auth/register", reg("verwaist@example.de"));
    const [orphan] = await db.select().from(schema.users).where(eq(schema.users.email, "verwaist@example.de"));
    await db.update(schema.users).set({ createdAt: new Date(Date.now() - 8 * 86400_000) }).where(eq(schema.users.id, orphan.id));
    await db.update(schema.authTokens).set({ expiresAt: new Date(Date.now() - 8 * 86400_000) }).where(eq(schema.authTokens.userId, orphan.id));
    const result = await app.get(RetentionService).runAll();
    expect(result.pendingAccounts).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(schema.users).where(eq(schema.users.id, orphan.id))).toHaveLength(0);
    expect(await db.select().from(schema.authTokens).where(eq(schema.authTokens.userId, orphan.id))).toHaveLength(0);
  });

  it("/health/ready und /platform zeigen das Mail-Kontingent", async () => {
    const ready = (await app.inject({ method: "GET", url: "/health/ready" })).json();
    expect(ready.mail).toMatchObject({ driver: "memory", warning: false });
    expect(ready.mail.day).toMatch(/^\d+\/200$/);
    const u = await signup("plattform-mail@example.de");
    expect((await app.inject({ method: "GET", url: "/platform/mail-quota", headers: { cookie: u.cookie } })).statusCode).toBe(403);
    await db.update(schema.users).set({ platformRole: "admin" }).where(eq(schema.users.id, u.id));
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
    const admin = cookieOf(await post("/auth/login", { email: "plattform-mail@example.de", password }));
    const q = (await app.inject({ method: "GET", url: "/platform/mail-quota", headers: { cookie: admin } })).json();
    expect(q).toMatchObject({ driver: "memory", day: { limit: 200 }, month: { limit: 3000 } });
    expect(q.day.used).toBeGreaterThan(0);
  });
});
