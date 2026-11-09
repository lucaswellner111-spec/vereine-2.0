import { Logger } from "@nestjs/common";
import { createTransport } from "nodemailer";
import type { MailTemplate, RenderedMail } from "./mail.templates";

/** headers: z. B. List-Unsubscribe/List-Unsubscribe-Post (nur fuer Sammelmail und Einladungen). */
export type OutgoingMail = RenderedMail & { to: string; template: MailTemplate; headers?: Record<string, string> };

export interface MailDriver {
  readonly name: "log" | "smtp" | "memory";
  send(mail: OutgoingMail): Promise<void>;
}

export type MailConfig =
  | { driver: "log" }
  | { driver: "smtp"; host: string; port: number; user: string; pass: string; from: string; replyTo?: string };

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
  const replyTo = env.MAIL_REPLY_TO?.trim() || undefined;
  return { driver: "smtp", host: env.SMTP_HOST!.trim(), port, user: env.SMTP_USER!.trim(), pass: env.SMTP_PASS!, from: env.MAIL_FROM!.trim(), ...(replyTo ? { replyTo } : {}) };
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
  sendMail(opts: { from: string; to: string; subject: string; text: string; html: string; replyTo?: string; headers?: Record<string, string> }): Promise<unknown>;
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
      await this.transport.sendMail({
        from: this.cfg.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(this.cfg.replyTo ? { replyTo: this.cfg.replyTo } : {}),
        ...(mail.headers ? { headers: mail.headers } : {}),
      });
    } catch (err) {
      const e = err as { code?: string; responseCode?: number };
      throw new Error(`SMTP-Versand fehlgeschlagen (Vorlage ${mail.template}, Code ${e.code ?? "?"}${e.responseCode ? `/${e.responseCode}` : ""}).`);
    }
  }
}

/** Nur Tests und lokaler PGlite-Server: behaelt die letzten Mails im Speicher (nie in Produktion verdrahtet). */
export class MemoryMailDriver implements MailDriver {
  readonly name = "memory" as const;
  readonly sent: OutgoingMail[] = [];

  async send(mail: OutgoingMail): Promise<void> {
    this.sent.push(mail);
    if (this.sent.length > 500) this.sent.shift();
  }

  /** Letzte Mail an eine Adresse (optional nur einer Vorlage). */
  last(to: string, template?: MailTemplate): OutgoingMail | undefined {
    const addr = to.trim().toLowerCase();
    return [...this.sent].reverse().find((m) => m.to.toLowerCase() === addr && (!template || m.template === template));
  }

  clear(): void {
    this.sent.length = 0;
  }
}

export function createMailDriver(cfg: MailConfig = mailConfigFromEnv()): MailDriver {
  return cfg.driver === "smtp" ? new SmtpMailDriver(cfg) : new LogMailDriver();
}
