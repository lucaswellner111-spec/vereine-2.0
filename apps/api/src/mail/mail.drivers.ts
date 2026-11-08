import { Logger } from "@nestjs/common";
import { createTransport } from "nodemailer";
import type { MailTemplate, RenderedMail } from "./mail.templates";

export type OutgoingMail = RenderedMail & { to: string; template: MailTemplate };

export interface MailDriver {
  readonly name: "log" | "smtp";
  send(mail: OutgoingMail): Promise<void>;
}

export type MailConfig =
  | { driver: "log" }
  | { driver: "smtp"; host: string; port: number; user: string; pass: string; from: string };

/**
 * Liest die Mail-Konfiguration. `MAIL_DRIVER=log` (Standard) oder `smtp`. Bei `smtp` sind SMTP_HOST, SMTP_USER,
 * SMTP_PASS und MAIL_FROM Pflicht (SMTP_PORT Standard 587); fehlt etwas, bricht der Start mit klarer Meldung ab.
 * Die Meldung nennt nur Variablennamen, nie Werte.
 */
export function mailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MailConfig {
  const driver = (env.MAIL_DRIVER ?? "log").trim().toLowerCase();
  if (driver === "log" || driver === "") return { driver: "log" };
  if (driver !== "smtp") throw new Error(`MAIL_DRIVER="${driver}" ist unbekannt (erlaubt: log, smtp).`);
  const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"].filter((k) => !env[k]?.trim());
  if (missing.length) throw new Error(`MAIL_DRIVER=smtp, aber es fehlen: ${missing.join(", ")}.`);
  const port = Number(env.SMTP_PORT?.trim() || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT ist keine gueltige Portnummer.");
  if (port === 465) throw new Error("SMTP_PORT=465 (implizites TLS) ist nicht vorgesehen: nutze 587 mit STARTTLS.");
  return { driver: "smtp", host: env.SMTP_HOST!.trim(), port, user: env.SMTP_USER!.trim(), pass: env.SMTP_PASS!, from: env.MAIL_FROM!.trim() };
}

/** Nur die Domain der Empfaengeradresse (fuer Logs). */
export function recipientDomain(to: string): string {
  const at = to.lastIndexOf("@");
  return at >= 0 ? to.slice(at + 1).toLowerCase() : "?";
}

/** Entwicklung/Vorschau: verschickt nichts und loggt nur Domain, Vorlage und Laenge (nie Inhalt, Links, Tokens, Adresse). */
export class LogMailDriver implements MailDriver {
  readonly name = "log" as const;
  private readonly log = new Logger("Mail");

  async send(mail: OutgoingMail): Promise<void> {
    this.log.log(`Mail nicht versendet (Treiber log): Vorlage=${mail.template}, Empfaenger-Domain=${recipientDomain(mail.to)}, Laenge=${mail.text.length}/${mail.html.length}`);
  }
}

/** Minimaler Ausschnitt des nodemailer-Transports (fuer Tests austauschbar). */
export interface SmtpTransport {
  sendMail(opts: { from: string; to: string; subject: string; text: string; html: string }): Promise<unknown>;
}

/** Versand per SMTP (Port 587, STARTTLS Pflicht: ohne TLS-Upgrade bricht die Verbindung ab). */
export class SmtpMailDriver implements MailDriver {
  readonly name = "smtp" as const;
  private readonly transport: SmtpTransport;

  constructor(
    private readonly cfg: Extract<MailConfig, { driver: "smtp" }>,
    transport?: SmtpTransport,
  ) {
    this.transport =
      transport ??
      createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: false,
        requireTLS: true,
        auth: { user: cfg.user, pass: cfg.pass },
        tls: { minVersion: "TLSv1.2" },
        logger: false,
        debug: false,
      });
  }

  /** Auch die Fehlermeldung bleibt ohne Adresse/Inhalt (SMTP-Antworten enthalten oft die Empfaengeradresse). */
  async send(mail: OutgoingMail): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.cfg.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
    } catch (err) {
      const e = err as { code?: string; responseCode?: number };
      throw new Error(`SMTP-Versand fehlgeschlagen (Vorlage ${mail.template}, Code ${e.code ?? "?"}${e.responseCode ? `/${e.responseCode}` : ""}).`);
    }
  }
}

export function createMailDriver(cfg: MailConfig = mailConfigFromEnv()): MailDriver {
  return cfg.driver === "smtp" ? new SmtpMailDriver(cfg) : new LogMailDriver();
}
