import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { z } from "zod";
import { JobsService } from "../jobs/jobs.service";
import type { MailDriver } from "./mail.drivers";
import { MAIL_TEMPLATES, renderMail, type MailTemplate, type MailTemplates } from "./mail.templates";

export const MAIL_DRIVER = Symbol("MAIL_DRIVER");

const jobSchema = z.object({
  to: z.string().email().max(254),
  template: z.enum(MAIL_TEMPLATES as [MailTemplate, ...MailTemplate[]]),
  data: z.record(z.string(), z.unknown()),
});

/**
 * Mailversand (vorbereitet, noch ohne Aufrufer). `send` legt den Job `mail.send` an; der Worker rendert und verschickt
 * mit Wiederholung (5 Versuche, exponentiell ab 30 s). Jobdaten (Adresse, Link) werden nach Erfolg/endgueltigem
 * Fehlschlag sofort aus Redis entfernt.
 */
@Injectable()
export class MailService implements OnModuleInit {
  constructor(
    @Inject(MAIL_DRIVER) private readonly driver: MailDriver,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  get driverName() {
    return this.driver.name;
  }

  onModuleInit() {
    this.jobs.define("mail.send", async (d: unknown) => this.deliver(d));
  }

  async send<T extends MailTemplate>(to: string, template: T, data: MailTemplates[T]): Promise<void> {
    const job = jobSchema.parse({ to, template, data });
    renderMail(template, data); // Vorlage/Link frueh pruefen (Fehler beim Aufrufer statt im Worker)
    await this.jobs.enqueue("mail.send", job, { attempts: 5, backoffMs: 30_000, removeOnComplete: true, removeOnFail: true });
  }

  /** Handler des Jobs `mail.send`. */
  async deliver(raw: unknown): Promise<void> {
    const job = jobSchema.parse(raw);
    const rendered = renderMail(job.template, job.data as never);
    await this.driver.send({ ...rendered, to: job.to, template: job.template });
  }
}
