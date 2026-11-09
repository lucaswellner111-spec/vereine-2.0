import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { z } from "zod";
import { appLink } from "../common/app-url";
import { berlinDate } from "../common/berlin-date";
import { JobsService } from "../jobs/jobs.service";
import type { MailDriver } from "./mail.drivers";
import { addressHash, MailLimits } from "./mail-limits";
import { MAIL_TEMPLATES, renderMail, TEMPLATE_META, type MailTemplate, type MailTemplates } from "./mail.templates";
import { SuppressionsService } from "./suppressions.service";
import { signUnsubscribe, verifyUnsubscribe, type UnsubscribePayload } from "./unsubscribe-token";

export const MAIL_DRIVER = Symbol("MAIL_DRIVER");

/** Verschobene Mails (volles Kontingent) hoechstens so oft auf den naechsten Tag schieben, dann verwerfen. */
const MAX_DEFERRALS = 3;

const jobSchema = z.object({
  to: z.string().email().max(254),
  template: z.enum(MAIL_TEMPLATES as [MailTemplate, ...MailTemplate[]]),
  data: z.record(z.string(), z.unknown()),
  unsubscribe: z.string().max(400).optional(),
  deferrals: z.number().int().min(0).max(MAX_DEFERRALS).optional(),
});
type MailJob = z.infer<typeof jobSchema>;

export type SendOptions = {
  /** Ausloesendes Konto (hoechstens 20 Mails/Tag). */
  actorId?: string;
  /** Verein (nur Einladungen: hoechstens 100/Tag). */
  orgId?: string;
  /** Abmeldelink ohne Login und List-Unsubscribe-Header (Sammelmail, Einladungen). */
  unsubscribe?: UnsubscribePayload;
};
export type SendResult = "queued" | "suppressed" | "limited:recipient" | "limited:actor" | "limited:org";

/** Millisekunden bis morgen 06:00 Uhr deutscher Zeit (ungefaehr; Sommerzeitwechsel egal). */
export function msUntilNextMorning(now = new Date()): number {
  const guess = new Date(`${berlinDate(new Date(now.getTime() + 24 * 3600_000))}T06:00:00Z`);
  const berlinHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(guess));
  return Math.max(60_000, guess.getTime() - (berlinHour - 6) * 3600_000 - now.getTime());
}

/**
 * Mailversand mit Kostenbremse (mail-limits.ts) und Sperrliste. `send` prueft Sperrliste und Limits je Empfaenger/Konto/Verein
 * und legt den Job `mail.send` an; der Worker prueft das globale Kontingent, rendert und verschickt mit Wiederholung
 * (5 Versuche, exponentiell ab 30 s). Jobdaten (Adresse, Link) werden nach Erfolg/endgueltigem Fehlschlag sofort aus
 * Redis entfernt. Logs nennen nur Vorlage und Ergebnis, nie Adresse oder Link.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly log = new Logger("Mail");
  private readonly unsubscribeHandlers = new Map<"digest", (userId: string) => Promise<void>>();

  constructor(
    @Inject(MAIL_DRIVER) private readonly driver: MailDriver,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(MailLimits) private readonly limits: MailLimits,
    @Inject(SuppressionsService) private readonly suppressions: SuppressionsService,
  ) {}

  get driverName() {
    return this.driver.name;
  }

  onModuleInit() {
    this.jobs.define("mail.send", async (d: unknown) => this.deliver(d));
  }

  async send<T extends MailTemplate>(to: string, template: T, data: MailTemplates[T], opts: SendOptions = {}): Promise<SendResult> {
    const token = opts.unsubscribe ? signUnsubscribe(opts.unsubscribe) : undefined;
    const fullData = token ? { ...data, unsubscribeLink: appLink(`/abmelden#t=${token}`) } : data;
    const job = jobSchema.parse({ to, template, data: fullData, ...(token ? { unsubscribe: token } : {}) });
    renderMail(template, fullData as MailTemplates[T]); // Vorlage/Link frueh pruefen (Fehler beim Aufrufer statt im Worker)

    const meta = TEMPLATE_META[template];
    const hash = addressHash(job.to);
    const result = await this.check(hash, meta.category, opts);
    if (result !== "queued") {
      this.log.log(`Mail ${template} nicht eingereiht: ${result}`);
      return result;
    }
    await this.enqueue(job);
    return "queued";
  }

  private async check(hash: string, category: (typeof TEMPLATE_META)[MailTemplate]["category"], opts: SendOptions): Promise<SendResult> {
    if (await this.suppressions.isSuppressed(hash, category === "invite" ? ["all", "invite"] : ["all"])) return "suppressed";
    if (await this.limits.recipientOver(hash)) return "limited:recipient";
    if (opts.actorId && (await this.limits.actorOver(opts.actorId))) return "limited:actor";
    if (opts.orgId && category === "invite" && (await this.limits.orgInvitesOver(opts.orgId))) return "limited:org";
    return "queued";
  }

  private enqueue(job: MailJob, delayMs?: number) {
    return this.jobs.enqueue("mail.send", job, { attempts: 5, backoffMs: 30_000, removeOnComplete: true, removeOnFail: true, ...(delayMs ? { delayMs } : {}) });
  }

  /** Handler des Jobs `mail.send` (Worker): globales Kontingent, dann rendern und versenden. */
  async deliver(raw: unknown): Promise<void> {
    const job = jobSchema.parse(raw);
    const meta = TEMPLATE_META[job.template];
    if (!(await this.limits.takeGlobal(meta.priority))) {
      const deferrable = meta.category === "service" || meta.category === "invite";
      const deferrals = job.deferrals ?? 0;
      if (deferrable && deferrals < MAX_DEFERRALS) {
        await this.enqueue({ ...job, deferrals: deferrals + 1 }, msUntilNextMorning());
        this.log.warn(`Mail-Kontingent erreicht: ${job.template} auf morgen verschoben.`);
      } else {
        this.log.warn(`Mail-Kontingent erreicht: ${job.template} verworfen.`);
      }
      return;
    }
    const rendered = renderMail(job.template, job.data as never);
    const headers = job.unsubscribe
      ? { "List-Unsubscribe": `<${appLink(`/api/mail/unsubscribe?t=${job.unsubscribe}`)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : undefined;
    await this.driver.send({ ...rendered, to: job.to, template: job.template, ...(headers ? { headers } : {}) });
  }

  /** Bereiche melden sich fuer Abmeldungen an (z. B. Benachrichtigungen: Sammelmail aus). */
  onUnsubscribe(kind: "digest", handler: (userId: string) => Promise<void>): void {
    this.unsubscribeHandlers.set(kind, handler);
  }

  /** Abmeldelink einloesen (ohne Login). false = ungueltiger Token. Wiederholtes Einloesen ist harmlos. */
  async unsubscribe(token: string): Promise<{ kind: UnsubscribePayload["k"] } | null> {
    const payload = verifyUnsubscribe(token);
    if (!payload) return null;
    if (payload.k === "invite") await this.suppressions.add(payload.h, "invite", "unsubscribe");
    else await this.unsubscribeHandlers.get("digest")?.(payload.u);
    this.log.log(`Abmeldung eingeloest: ${payload.k}`);
    return { kind: payload.k };
  }

  quota() {
    return this.limits.status();
  }
}
