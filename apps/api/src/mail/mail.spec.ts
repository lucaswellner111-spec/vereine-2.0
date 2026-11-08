import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobsModule } from "../jobs/jobs.module";
import { JobsService } from "../jobs/jobs.service";
import { LogMailDriver, SmtpMailDriver, createMailDriver, mailConfigFromEnv, recipientDomain, type SmtpTransport } from "./mail.drivers";
import { MailModule } from "./mail.module";
import { MAIL_DRIVER, MailService } from "./mail.service";
import { MAIL_TEMPLATES, renderMail } from "./mail.templates";

const SECRET_LINK = "https://klubnest.de/passwort/neu?token=SUPERGEHEIMES-TOKEN-123";
const smtpEnv = { MAIL_DRIVER: "smtp", SMTP_HOST: "smtp.tem.scw.cloud", SMTP_USER: "user", SMTP_PASS: "pass", MAIL_FROM: "Klubnest <noreply@klubnest.de>" };

describe("Mail: Konfiguration", () => {
  it("Standard ist der Log-Treiber", () => {
    expect(mailConfigFromEnv({})).toEqual({ driver: "log" });
    expect(createMailDriver({ driver: "log" }).name).toBe("log");
  });

  it("smtp: Port 587 als Standard, Werte uebernommen", () => {
    expect(mailConfigFromEnv(smtpEnv)).toMatchObject({ driver: "smtp", host: "smtp.tem.scw.cloud", port: 587, from: "Klubnest <noreply@klubnest.de>" });
    expect(mailConfigFromEnv({ ...smtpEnv, SMTP_PORT: "2587" })).toMatchObject({ port: 2587 });
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

  describe("Startfehler im Modul", () => {
    const saved = { ...process.env };
    afterEach(() => {
      for (const k of Object.keys(smtpEnv)) delete process.env[k];
      Object.assign(process.env, saved);
    });

    it("MAIL_DRIVER=smtp ohne SMTP-Variablen: Modul startet nicht", async () => {
      process.env.MAIL_DRIVER = "smtp";
      for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"]) delete process.env[k];
      await expect(Test.createTestingModule({ imports: [JobsModule, MailModule] }).compile()).rejects.toThrow(/MAIL_DRIVER=smtp, aber es fehlen/);
    });

    it("ohne MAIL_DRIVER: Log-Treiber", async () => {
      delete process.env.MAIL_DRIVER;
      const ref = await Test.createTestingModule({ imports: [JobsModule, MailModule] }).compile();
      expect(ref.get(MailService).driverName).toBe("log");
      await ref.close();
    });
  });
});

describe("Mail: Treiber", () => {
  afterEach(() => vi.restoreAllMocks());

  it("Log-Treiber loggt nur Domain, Vorlage und Laenge – nie Inhalt, Link, Token oder Adresse", async () => {
    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const ref = await Test.createTestingModule({ imports: [JobsModule], providers: [MailService, { provide: MAIL_DRIVER, useValue: new LogMailDriver() }] }).compile();
    await ref.init();
    const mail = ref.get(MailService);
    await mail.send("lena.mueller@Example.DE", "password-reset", { name: "Lena Müller", link: SECRET_LINK, validMinutes: 30 });
    const lines = spy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("Treiber log"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("example.de");
    expect(lines[0]).toContain("password-reset");
    expect(lines[0]).toMatch(/Laenge=\d+\/\d+/);
    for (const forbidden of ["lena", "Lena", "Müller", "SUPERGEHEIM", "token", "passwort/neu", "Passwort"]) expect(lines[0]).not.toContain(forbidden);
    await ref.close();
  });

  it("send prueft Adresse und Link, bevor ein Job entsteht", async () => {
    const ref = await Test.createTestingModule({ imports: [JobsModule], providers: [MailService, { provide: MAIL_DRIVER, useValue: new LogMailDriver() }] }).compile();
    await ref.init();
    const mail = ref.get(MailService);
    const enqueue = vi.spyOn(ref.get(JobsService), "enqueue");
    await expect(mail.send("keine-adresse", "verify-email", { name: "A", link: "https://klubnest.de/x" })).rejects.toThrow();
    await expect(mail.send("a@example.de", "verify-email", { name: "A", link: "javascript:alert(1)" })).rejects.toThrow(/http/);
    expect(enqueue).not.toHaveBeenCalled();
    await mail.send("a@example.de", "verify-email", { name: "A", link: "https://klubnest.de/x" });
    expect(enqueue).toHaveBeenCalledWith(
      "mail.send",
      expect.objectContaining({ template: "verify-email" }),
      expect.objectContaining({ attempts: 5, removeOnComplete: true, removeOnFail: true }),
    );
    await ref.close();
  });

  it("smtp-Treiber mit gemocktem Transport: sendet Text und HTML ueber den Job", async () => {
    const sendMail = vi.fn<SmtpTransport["sendMail"]>().mockResolvedValue({});
    const driver = new SmtpMailDriver(mailConfigFromEnv(smtpEnv) as never, { sendMail });
    const ref = await Test.createTestingModule({ imports: [JobsModule], providers: [MailService, { provide: MAIL_DRIVER, useValue: driver }] }).compile();
    await ref.init();
    await ref.get(MailService).send("ben@example.de", "invite", { orgName: "SV <Grün>", link: "https://klubnest.de/einladung/abc", inviterName: "Vera" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0][0];
    expect(arg).toMatchObject({ from: "Klubnest <noreply@klubnest.de>", to: "ben@example.de", subject: "Einladung zu SV <Grün>" });
    expect(arg.text).toContain("https://klubnest.de/einladung/abc");
    expect(arg.html).toContain("SV &lt;Grün&gt;");
    expect(arg.html).not.toContain("<Grün>");
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

  it("Empfaenger-Domain", () => {
    expect(recipientDomain("A.B@Sub.Example.DE")).toBe("sub.example.de");
    expect(recipientDomain("kaputt")).toBe("?");
  });
});

describe("Mail: Vorlagen", () => {
  const samples = {
    "verify-email": { name: "Lena", link: "https://klubnest.de/bestaetigen?t=1" },
    "password-reset": { name: "Lena", link: "https://klubnest.de/neu?t=1", validMinutes: 30 },
    invite: { orgName: "SV Grün", link: "https://klubnest.de/einladung/1" },
    "invoice-new": { name: "Lena", orgName: "SV Grün", number: "2026-0001", amount: "48,00 €", dueDate: "01.12.2026", link: "https://klubnest.de/rechnungen" },
  } as const;

  it.each(MAIL_TEMPLATES)("%s: Text und HTML, Deutsch in Du-Form, ohne externe Ressourcen", (t) => {
    const r = renderMail(t, samples[t] as never);
    expect(r.subject.length).toBeGreaterThan(5);
    expect(r.text).toContain(samples[t].link);
    expect(r.html).toContain('lang="de"');
    expect(r.text).toMatch(/\b(du|dich|dir|dein|deine|deinem|deinen|Dein)\b/);
    expect(r.text).not.toMatch(/\b(Sie|Ihr|Ihre|Ihnen)\b/);
    expect(r.html).not.toMatch(/<img|<link|<script|src=/i);
  });

  it("Rechnungs-Mail nennt Nummer, Betrag und Faelligkeit", () => {
    const r = renderMail("invoice-new", samples["invoice-new"]);
    expect(r.text).toContain("2026-0001");
    expect(r.text).toContain("48,00 €");
    expect(r.text).toContain("01.12.2026");
  });
});
