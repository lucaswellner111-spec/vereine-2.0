import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CACHE, CacheModule, MemoryCache } from "../cache/cache.module";
import { DB, DbModule } from "../db/db.module";
import * as schema from "../db/schema";
import { JobsModule } from "../jobs/jobs.module";
import { JobsService } from "../jobs/jobs.service";
import { createTestDb, type TestDb } from "../testing/test-db";
import { LogMailDriver, MemoryMailDriver, SmtpMailDriver, createMailDriver, mailConfigFromEnv, recipientDomain, type MailDriver, type SmtpTransport } from "./mail.drivers";
import { addressHash, allowedFor, globalLimitsFromEnv, MailLimits, MAIL_LIMITS } from "./mail-limits";
import { MailModule } from "./mail.module";
import { MAIL_DRIVER, MailService, msUntilNextMorning } from "./mail.service";
import { MAIL_TEMPLATES, maskEmail, renderMail, type MailTemplate } from "./mail.templates";
import { SuppressionsService } from "./suppressions.service";
import { signUnsubscribe, verifyUnsubscribe } from "./unsubscribe-token";

const SECRET_LINK = "https://klubnest.de/passwort/neu?token=SUPERGEHEIMES-TOKEN-123";
const smtpEnv = { MAIL_DRIVER: "smtp", SMTP_HOST: "smtp.tem.scw.cloud", SMTP_USER: "user", SMTP_PASS: "pass", MAIL_FROM: "Klubnest <noreply@klubnest.de>" };

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});

/** Mail-Modul mit Test-DB, Prozess-Cache und austauschbarem Treiber. */
async function mailModule(driver: MailDriver) {
  const ref = await Test.createTestingModule({ imports: [DbModule, CacheModule, JobsModule, MailModule] })
    .overrideProvider(DB)
    .useValue(db)
    .overrideProvider(MAIL_DRIVER)
    .useValue(driver)
    .overrideProvider(CACHE)
    .useValue(new MemoryCache())
    .compile();
  await ref.init();
  return ref;
}

describe("Mail: Konfiguration", () => {
  it("Standard ist der Log-Treiber", () => {
    expect(mailConfigFromEnv({})).toEqual({ driver: "log" });
    expect(createMailDriver({ driver: "log" }).name).toBe("log");
  });

  it("smtp: Port 587 als Standard, Werte uebernommen, Antwortadresse optional", () => {
    expect(mailConfigFromEnv(smtpEnv)).toMatchObject({ driver: "smtp", host: "smtp.tem.scw.cloud", port: 587, from: "Klubnest <noreply@klubnest.de>" });
    expect(mailConfigFromEnv(smtpEnv)).not.toHaveProperty("replyTo");
    expect(mailConfigFromEnv({ ...smtpEnv, SMTP_PORT: "2587", MAIL_REPLY_TO: "kontakt@klubnest.de" })).toMatchObject({ port: 2587, replyTo: "kontakt@klubnest.de" });
    expect(mailConfigFromEnv({ ...smtpEnv, SMTP_PORT: "" })).toMatchObject({ port: 587 });
  });

  it("log ohne SMTP-Werte startet (Compose reicht leere Werte durch)", () => {
    expect(mailConfigFromEnv({ MAIL_DRIVER: "log", SMTP_HOST: "", SMTP_PORT: "587", SMTP_USER: "", SMTP_PASS: "", MAIL_FROM: "" })).toEqual({ driver: "log" });
  });

  it("smtp ohne Pflichtvariablen: klarer Fehler mit Variablennamen, ohne Werte", () => {
    expect(() => mailConfigFromEnv({ MAIL_DRIVER: "smtp" })).toThrow("MAIL_DRIVER=smtp, aber es fehlen: SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM.");
    let msg = "";
    try {
      mailConfigFromEnv({ ...smtpEnv, SMTP_PASS: "" });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe("MAIL_DRIVER=smtp, aber es fehlen: SMTP_PASS.");
    expect(msg).not.toContain("smtp.tem.scw.cloud");
  });

  it("unbekannter Treiber, Port 465 und ungueltiger Port werden abgelehnt", () => {
    expect(() => mailConfigFromEnv({ MAIL_DRIVER: "sendgrid" })).toThrow(/unbekannt/);
    expect(() => mailConfigFromEnv({ ...smtpEnv, SMTP_PORT: "465" })).toThrow(/STARTTLS/);
    expect(() => mailConfigFromEnv({ ...smtpEnv, SMTP_PORT: "abc" })).toThrow(/Portnummer/);
  });

  it("globale Limits: Standard 200/3000, ungueltige Werte fallen auf den Standard", () => {
    expect(globalLimitsFromEnv({})).toEqual({ daily: 200, monthly: 3000 });
    expect(globalLimitsFromEnv({ MAIL_DAILY_LIMIT: "50", MAIL_MONTHLY_LIMIT: "" })).toEqual({ daily: 50, monthly: 3000 });
    expect(globalLimitsFromEnv({ MAIL_DAILY_LIMIT: "-3", MAIL_MONTHLY_LIMIT: "abc" })).toEqual({ daily: 200, monthly: 3000 });
  });

  describe("Startfehler im Modul", () => {
    const saved = { ...process.env };
    afterEach(() => {
      for (const k of Object.keys(smtpEnv)) delete process.env[k];
      Object.assign(process.env, saved);
    });
    const compile = () => Test.createTestingModule({ imports: [DbModule, CacheModule, JobsModule, MailModule] }).overrideProvider(DB).useValue(db).compile();

    it("MAIL_DRIVER=smtp ohne SMTP-Variablen: Modul startet nicht", async () => {
      process.env.MAIL_DRIVER = "smtp";
      for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"]) delete process.env[k];
      await expect(compile()).rejects.toThrow(/MAIL_DRIVER=smtp, aber es fehlen/);
    });

    it("ohne MAIL_DRIVER: Log-Treiber", async () => {
      delete process.env.MAIL_DRIVER;
      const ref = await compile();
      expect(ref.get(MailService).driverName).toBe("log");
      await ref.close();
    });
  });
});

describe("Mail: Treiber und Versand", () => {
  afterEach(() => vi.restoreAllMocks());

  it("Log-Treiber loggt nur Domain, Vorlage und Laenge – nie Inhalt, Link, Token oder Adresse", async () => {
    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const ref = await mailModule(new LogMailDriver());
    await ref.get(MailService).send("lena.mueller@Example.DE", "password-reset", { name: "Lena Müller", link: SECRET_LINK, validMinutes: 30 });
    const all = spy.mock.calls.map((c) => String(c[0]));
    const lines = all.filter((l) => l.includes("Treiber log"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("example.de");
    expect(lines[0]).toContain("password-reset");
    expect(lines[0]).toMatch(/Laenge=\d+\/\d+/);
    for (const line of all) for (const forbidden of ["lena", "Lena", "Müller", "SUPERGEHEIM", "token", "passwort/neu"]) expect(line).not.toContain(forbidden);
    await ref.close();
  });

  it("send prueft Adresse und Link, bevor ein Job entsteht", async () => {
    const ref = await mailModule(new MemoryMailDriver());
    const mail = ref.get(MailService);
    const enqueue = vi.spyOn(ref.get(JobsService), "enqueue");
    await expect(mail.send("keine-adresse", "verify-email", { name: "A", link: "https://klubnest.de/x" })).rejects.toThrow();
    await expect(mail.send("a@example.de", "verify-email", { name: "A", link: "javascript:alert(1)" })).rejects.toThrow(/http/);
    expect(enqueue).not.toHaveBeenCalled();
    expect(await mail.send("a@example.de", "verify-email", { name: "A", link: "https://klubnest.de/x" })).toBe("queued");
    expect(enqueue).toHaveBeenCalledWith(
      "mail.send",
      expect.objectContaining({ template: "verify-email" }),
      expect.objectContaining({ attempts: 5, removeOnComplete: true, removeOnFail: true }),
    );
    await ref.close();
  });

  it("smtp-Treiber mit gemocktem Transport: Text, HTML, Antwortadresse und Abmelde-Header", async () => {
    const sendMail = vi.fn<SmtpTransport["sendMail"]>().mockResolvedValue({});
    const driver = new SmtpMailDriver(mailConfigFromEnv({ ...smtpEnv, MAIL_REPLY_TO: "kontakt@klubnest.de" }) as never, { sendMail });
    const ref = await mailModule(driver);
    await ref.get(MailService).send(
      "ben@example.de",
      "invite",
      { orgName: "SV <Grün>", link: "https://klubnest.de/einladung/abc", inviterName: "Vera" },
      { unsubscribe: { k: "invite", h: addressHash("ben@example.de") } },
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0][0];
    expect(arg).toMatchObject({ from: "Klubnest <noreply@klubnest.de>", to: "ben@example.de", subject: "Einladung zu SV <Grün>", replyTo: "kontakt@klubnest.de" });
    expect(arg.text).toContain("https://klubnest.de/einladung/abc");
    expect(arg.text).toMatch(/Abmelden: http:\/\/localhost:3000\/abmelden#t=/);
    expect(arg.html).toContain("SV &lt;Grün&gt;");
    expect(arg.html).not.toContain("<Grün>");
    expect(arg.headers?.["List-Unsubscribe"]).toMatch(/^<http:\/\/localhost:3000\/api\/mail\/unsubscribe\?t=[^>]+>$/);
    expect(arg.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    await ref.close();
  });

  it("Mails ohne Abmeldelink haben keine List-Unsubscribe-Header", async () => {
    const driver = new MemoryMailDriver();
    const ref = await mailModule(driver);
    await ref.get(MailService).send("x@example.de", "verify-email", { name: "X", link: "https://klubnest.de/v" });
    expect(driver.last("x@example.de")?.headers).toBeUndefined();
    await ref.close();
  });

  it("smtp-Fehler: Meldung ohne Empfaengeradresse", async () => {
    const err = Object.assign(new Error("Can't send mail - all recipients were rejected: 550 <ben@example.de>"), { code: "EENVELOPE", responseCode: 550 });
    const driver = new SmtpMailDriver(mailConfigFromEnv(smtpEnv) as never, { sendMail: vi.fn().mockRejectedValue(err) });
    const rendered = renderMail("verify-email", { name: "Ben", link: "https://klubnest.de/v" });
    await expect(driver.send({ ...rendered, to: "ben@example.de", template: "verify-email" })).rejects.toThrow("SMTP-Versand fehlgeschlagen (Vorlage verify-email, Code EENVELOPE/550).");
  });

  it("echter nodemailer-Transport: STARTTLS Pflicht, kein implizites TLS", () => {
    const driver = new SmtpMailDriver(mailConfigFromEnv(smtpEnv) as never);
    const options = (driver as unknown as { transport: { options: Record<string, unknown> } }).transport.options;
    expect(options).toMatchObject({ host: "smtp.tem.scw.cloud", port: 587, secure: false, requireTLS: true });
  });

  it("Empfaenger-Domain und maskierte Adresse", () => {
    expect(recipientDomain("A.B@Sub.Example.DE")).toBe("sub.example.de");
    expect(recipientDomain("kaputt")).toBe("?");
    expect(maskEmail("lena.mueller@example.de")).toBe("l***@example.de");
  });
});

describe("Mail: Kostenbremse", () => {
  const link = "https://klubnest.de/x";
  let driver: MemoryMailDriver;
  let ref: Awaited<ReturnType<typeof mailModule>>;
  let mail: MailService;
  let limits: MailLimits;
  const saved = { ...process.env };

  beforeEach(async () => {
    process.env.MAIL_DAILY_LIMIT = "10";
    process.env.MAIL_MONTHLY_LIMIT = "1000";
    driver = new MemoryMailDriver();
    ref = await mailModule(driver);
    mail = ref.get(MailService);
    limits = ref.get(MailLimits);
  });
  afterEach(async () => {
    await ref.close();
    Object.assign(process.env, saved);
    if (!saved.MAIL_DAILY_LIMIT) delete process.env.MAIL_DAILY_LIMIT;
    if (!saved.MAIL_MONTHLY_LIMIT) delete process.env.MAIL_MONTHLY_LIMIT;
  });

  it("Vorrang: wichtige Mails bis 100 %, alle anderen stoppen bei 80 %", async () => {
    expect(allowedFor(10, "critical")).toBe(10);
    expect(allowedFor(10, "normal")).toBe(8);
    expect(allowedFor(3000, "normal")).toBe(2400);
    for (let i = 0; i < 8; i++) await mail.send(`n${i}@example.de`, "invoice-new", { name: "N", orgName: "SV", number: "1", amount: "1 €", dueDate: "01.01.2027", link });
    expect(driver.sent).toHaveLength(8);
    // 9. normale Mail: verschoben (nicht verschickt), Bestaetigung geht noch durch
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    await mail.send("n8@example.de", "invoice-new", { name: "N", orgName: "SV", number: "1", amount: "1 €", dueDate: "01.01.2027", link });
    expect(driver.sent).toHaveLength(8);
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("invoice-new auf morgen verschoben");
    await mail.send("v1@example.de", "verify-email", { name: "V", link });
    await mail.send("v2@example.de", "password-reset", { name: "V", link, validMinutes: 60 });
    expect(driver.sent).toHaveLength(10);
    // 100 %: auch wichtige Mails werden verworfen
    await mail.send("v3@example.de", "verify-email", { name: "V", link });
    expect(driver.sent).toHaveLength(10);
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("verify-email verworfen");
    // Logs nennen nie die Adresse
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).not.toContain("@");
    const status = await limits.status();
    expect(status).toMatchObject({ day: { used: 10, limit: 10, percent: 100 }, warning: true, percent: 100 });
    warn.mockRestore();
  });

  it("Sammelmail bei vollem Kontingent: verworfen, nicht verschoben", async () => {
    const enqueue = vi.spyOn(ref.get(JobsService), "enqueue");
    for (let i = 0; i < 8; i++) await mail.send(`d${i}@example.de`, "verify-email", { name: "D", link });
    enqueue.mockClear();
    await mail.send("late@example.de", "notification-digest", { name: "L", lines: ["1 neuer Kommentar"], link });
    expect(driver.last("late@example.de")).toBeUndefined();
    expect(enqueue).toHaveBeenCalledTimes(1); // nur das erste Einreihen, kein erneutes fuer morgen
  });

  it("Status: Prozent und Warnung ab 80 %", async () => {
    for (let i = 0; i < 8; i++) await mail.send(`s${i}@example.de`, "verify-email", { name: "S", link });
    expect(await limits.status()).toMatchObject({ day: { used: 8, percent: 80 }, month: { used: 8, limit: 1000, percent: 1 }, percent: 80, warning: true });
  });

  it("je Empfaenger hoechstens 5 pro Stunde", async () => {
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await mail.send("Oft@Example.de", "verify-email", { name: "O", link }));
    expect(results.slice(0, 5)).toEqual(Array(5).fill("queued"));
    expect(results[5]).toBe("limited:recipient");
    expect(driver.sent).toHaveLength(5);
  });

  it("je ausloesendem Konto hoechstens 20 pro Tag, Einladungs-Mails je Verein 100 pro Tag", async () => {
    const actor = "00000000-0000-4000-8000-000000000001";
    const results = [];
    for (let i = 0; i < MAIL_LIMITS.actorPerDay + 1; i++) results.push(await mail.send(`a${i}@example.de`, "invite", { orgName: "SV", link }, { actorId: actor }));
    expect(results.filter((r) => r === "queued")).toHaveLength(20);
    expect(results.at(-1)).toBe("limited:actor");
    const org = "00000000-0000-4000-8000-0000000000aa";
    const orgResults = [];
    for (let i = 0; i < MAIL_LIMITS.orgInvitesPerDay + 1; i++) orgResults.push(await mail.send(`o${i}@example.de`, "invite", { orgName: "SV", link }, { orgId: org }));
    expect(orgResults.filter((r) => r === "queued")).toHaveLength(100);
    expect(orgResults.at(-1)).toBe("limited:org");
  });

  it("Passwort/Bestaetigung: je IP 5 pro Stunde (429), je Adresse 3 pro Stunde (still); lokal zaehlt nicht", async () => {
    for (let i = 0; i < 5; i++) await limits.enforceAuthIp("203.0.113.7");
    await expect(limits.enforceAuthIp("203.0.113.7")).rejects.toMatchObject({ status: 429 });
    await expect(limits.enforceAuthIp("203.0.113.8")).resolves.toBeUndefined();
    for (let i = 0; i < 20; i++) await limits.enforceAuthIp("127.0.0.1");
    expect([await limits.authAddressAllowed("x@example.de"), await limits.authAddressAllowed("X@example.de"), await limits.authAddressAllowed("x@example.de")]).toEqual([true, true, true]);
    expect(await limits.authAddressAllowed("x@example.de")).toBe(false);
  });

  it("Verschieben: bis morgen frueh (mindestens eine Minute, hoechstens gut 30 Stunden)", () => {
    const ms = msUntilNextMorning(new Date("2026-11-09T21:00:00Z"));
    expect(new Date(Date.parse("2026-11-09T21:00:00Z") + ms).toISOString()).toBe("2026-11-10T05:00:00.000Z"); // 06:00 MEZ
    const summer = msUntilNextMorning(new Date("2026-07-01T10:00:00Z"));
    expect(new Date(Date.parse("2026-07-01T10:00:00Z") + summer).toISOString()).toBe("2026-07-02T04:00:00.000Z"); // 06:00 MESZ
  });
});

describe("Mail: Sperrliste und Abmeldung", () => {
  let driver: MemoryMailDriver;
  let ref: Awaited<ReturnType<typeof mailModule>>;
  let mail: MailService;
  let sup: SuppressionsService;
  const link = "https://klubnest.de/x";

  beforeEach(async () => {
    driver = new MemoryMailDriver();
    ref = await mailModule(driver);
    mail = ref.get(MailService);
    sup = ref.get(SuppressionsService);
  });
  afterEach(() => ref.close());
  afterAll(async () => {
    await db.delete(schema.mailSuppressions);
  });

  it("Abmeldelink: signiert, ohne Adresse, Manipulation wird erkannt", () => {
    const t = signUnsubscribe({ k: "invite", h: addressHash("eva@example.de") });
    expect(t).not.toContain("eva");
    expect(verifyUnsubscribe(t)).toEqual({ k: "invite", h: addressHash("eva@example.de") });
    const [body, mac] = t.split(".");
    expect(verifyUnsubscribe(`${body}.${mac.slice(0, -2)}xx`)).toBeNull();
    expect(verifyUnsubscribe(`${Buffer.from(JSON.stringify({ k: "invite", h: "0".repeat(64) })).toString("base64url")}.${mac}`)).toBeNull();
    expect(verifyUnsubscribe("kaputt")).toBeNull();
  });

  it("Abmeldung von Einladungen: Hash in der Sperrliste, weitere Einladungen still verworfen, Auth-Mails weiter", async () => {
    const t = signUnsubscribe({ k: "invite", h: addressHash("Eva@Example.de") });
    expect(await mail.unsubscribe(t)).toEqual({ kind: "invite" });
    expect(await mail.unsubscribe(t)).toEqual({ kind: "invite" }); // wiederholt harmlos
    const rows = await db.select().from(schema.mailSuppressions);
    expect(rows.some((r) => r.addressHash === addressHash("eva@example.de") && r.scope === "invite" && r.reason === "unsubscribe")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("eva");
    expect(await mail.send("eva@example.de", "invite", { orgName: "SV", link })).toBe("suppressed");
    expect(await mail.send("eva@example.de", "password-reset", { name: "E", link, validMinutes: 60 })).toBe("queued");
    expect(driver.sent.map((m) => m.template)).toEqual(["password-reset"]);
    expect(await sup.exportFor("eva@example.de")).toEqual([expect.objectContaining({ scope: "invite", reason: "unsubscribe" })]);
  });

  it("harter Bounce (vorbereitet fuer Webhook): blockt alle Mails; Kontoloeschung entfernt nur diese Sperre", async () => {
    await sup.recordBounce("tot@example.de");
    await sup.add(addressHash("tot@example.de"), "invite", "unsubscribe");
    for (const t of ["verify-email", "invite"] as MailTemplate[]) {
      expect(await mail.send("tot@example.de", t as "verify-email", { name: "T", link, orgName: "SV" } as never)).toBe("suppressed");
    }
    await sup.eraseFor("tot@example.de");
    expect((await sup.exportFor("tot@example.de")).map((r) => r.scope)).toEqual(["invite"]);
  });

  it("Loeschfristen: Bounces nach 12, Abmeldungen nach 36 Monaten", async () => {
    await db.insert(schema.mailSuppressions).values([
      { addressHash: "a".repeat(64), scope: "all", reason: "bounce", createdAt: new Date(Date.now() - 400 * 86400_000) },
      { addressHash: "b".repeat(64), scope: "invite", reason: "unsubscribe", createdAt: new Date(Date.now() - 400 * 86400_000) },
      { addressHash: "c".repeat(64), scope: "invite", reason: "unsubscribe", createdAt: new Date(Date.now() - 1200 * 86400_000) },
    ]);
    expect(await sup.purgeExpired()).toBe(2);
    const left = (await db.select().from(schema.mailSuppressions)).map((r) => r.addressHash);
    expect(left).toContain("b".repeat(64));
    expect(left).not.toContain("a".repeat(64));
    expect(left).not.toContain("c".repeat(64));
  });

  it("ungueltiger Abmeldelink: null, keine Aenderung", async () => {
    expect(await mail.unsubscribe("abc.def")).toBeNull();
  });
});

describe("Mail: Vorlagen", () => {
  const samples: Record<MailTemplate, Record<string, unknown> & { link: string }> = {
    "verify-email": { name: "Lena", link: "https://klubnest.de/bestaetigen#t=1" },
    "password-reset": { name: "Lena", link: "https://klubnest.de/neu#t=1", validMinutes: 60 },
    "account-exists": { name: "Lena", link: "https://klubnest.de/login", resetLink: "https://klubnest.de/passwort-vergessen" },
    "registration-complete": { name: "Lena", link: "https://klubnest.de/passwort-neu#t=3", validMinutes: 60 },
    "email-change-confirm": { name: "Lena", link: "https://klubnest.de/email-bestaetigen#t=2" },
    "email-change-notice": { name: "Lena", newEmailMasked: "n***@example.de", link: "https://klubnest.de/passwort-vergessen" },
    invite: { orgName: "SV Grün", link: "https://klubnest.de/einladung/1", unsubscribeLink: "https://klubnest.de/abmelden#t=x" },
    "member-invite": { orgName: "SV Grün", firstName: "Lena", link: "https://klubnest.de/einladung/2", validDays: 30, unsubscribeLink: "https://klubnest.de/abmelden#t=z" },
    "invoice-new": { name: "Lena", orgName: "SV Grün", number: "2026-0001", amount: "48,00 €", dueDate: "01.12.2026", link: "https://klubnest.de/rechnungen" },
    "notification-digest": { name: "Lena", lines: ["2 neue Kommentare", "1 neue Rechnung"], link: "https://klubnest.de/benachrichtigungen", unsubscribeLink: "https://klubnest.de/abmelden#t=y" },
  };

  it.each(MAIL_TEMPLATES)("%s: Text und HTML, Deutsch in Du-Form, ohne externe Ressourcen", (t) => {
    const r = renderMail(t, samples[t] as never);
    expect(r.subject.length).toBeGreaterThan(5);
    expect(r.text).toContain(samples[t].link);
    expect(r.html).toContain('lang="de"');
    expect(r.text).toMatch(/\b(du|dich|dir|dein|deine|deinem|deinen|deiner|Dein)\b/);
    expect(r.text).not.toMatch(/\b(Sie|Ihr|Ihre|Ihnen)\b/);
    expect(r.html).not.toMatch(/<img|<link|<script|src=/i);
  });

  it("Rechnungs-Mail nennt Nummer, Betrag und Faelligkeit (Link, kein Anhang)", () => {
    const r = renderMail("invoice-new", samples["invoice-new"] as never);
    expect(r.text).toContain("2026-0001");
    expect(r.text).toContain("48,00 €");
    expect(r.text).toContain("01.12.2026");
  });

  it("Sammelmail und Einladung tragen den Abmeldelink, Bestaetigung nicht", () => {
    expect(renderMail("notification-digest", samples["notification-digest"] as never).text).toContain("Abmelden: https://klubnest.de/abmelden#t=y");
    expect(renderMail("notification-digest", samples["notification-digest"] as never).html).toContain("<li>2 neue Kommentare</li>");
    expect(renderMail("invite", samples.invite as never).text).toContain("Abmelden: https://klubnest.de/abmelden#t=x");
    expect(renderMail("verify-email", samples["verify-email"] as never).text).not.toContain("Abmelden");
  });
});
