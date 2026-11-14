import { readFile, statfs } from "node:fs/promises";
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { OpsAlert, OpsStatus } from "@vereine/shared";
import { CACHE, type Cache } from "../cache/cache.module";
import { appLink } from "../common/app-url";
import { berlinDate } from "../common/berlin-date";
import { JobsService } from "../jobs/jobs.service";
import { MailService } from "../mail/mail.service";

const HEARTBEAT_KEY = "ops:worker:heartbeat";
const HEARTBEAT_EVERY_MS = 30_000;
const HEARTBEAT_TTL_SEC = 120;
const CHECK_EVERY_MS = 5 * 60_000;

export type OpsConfig = {
  alertEmail: string | null;
  jobsFailedMax: number;
  jobsBacklogMax: number;
  mailQuotaPercent: number;
  diskPercent: number;
  backupMaxAgeHours: number;
  diskPath: string;
  backupStatusFile: string | null;
};

function positive(raw: string | undefined, fallback: number): number {
  const n = Number(raw?.trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function opsConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OpsConfig {
  return {
    alertEmail: env.OPERATOR_ALERT_EMAIL?.trim() || null,
    jobsFailedMax: positive(env.OPS_JOBS_FAILED_MAX, 5),
    jobsBacklogMax: positive(env.OPS_JOBS_BACKLOG_MAX, 500),
    mailQuotaPercent: positive(env.OPS_MAIL_QUOTA_PERCENT, 80),
    diskPercent: positive(env.OPS_DISK_PERCENT, 80),
    backupMaxAgeHours: positive(env.OPS_BACKUP_MAX_AGE_HOURS, 30),
    diskPath: env.OPS_DISK_PATH?.trim() || env.MEDIA_DIR?.trim() || process.cwd(),
    backupStatusFile: env.BACKUP_STATUS_FILE?.trim() || null,
  };
}

export type OpsSnapshot = {
  worker: OpsStatus["worker"];
  jobs: OpsStatus["jobs"];
  mailPercent: number | null;
  diskPercent: number | null;
  backup: OpsStatus["backup"];
};

/** Reine Bewertung der Messwerte (ohne E/A, gut testbar). Texte sind fest und enthalten nur Zahlen. */
export function evaluateAlerts(s: OpsSnapshot, cfg: OpsConfig): OpsAlert[] {
  const alerts: OpsAlert[] = [];
  if (s.worker === "down") {
    alerts.push({ kind: "worker", title: "Worker antwortet nicht", detail: "Seit mehr als 2 Minuten kein Lebenszeichen des Worker-Containers. Mails, Erinnerungen und Aufräumjobs laufen nicht." });
  }
  if (s.jobs && s.jobs.failed >= cfg.jobsFailedMax) {
    alerts.push({ kind: "jobs-failed", title: "Fehlgeschlagene Jobs", detail: `${s.jobs.failed} Jobs sind endgültig fehlgeschlagen (Schwelle ${cfg.jobsFailedMax}). Logs des Workers prüfen.` });
  }
  if (s.jobs && s.jobs.waiting >= cfg.jobsBacklogMax) {
    alerts.push({ kind: "jobs-backlog", title: "Job-Warteschlange wächst", detail: `${s.jobs.waiting} Jobs warten (Schwelle ${cfg.jobsBacklogMax}). Der Worker hängt oder ist überlastet.` });
  }
  if (s.mailPercent !== null && s.mailPercent >= cfg.mailQuotaPercent) {
    alerts.push({ kind: "mail-quota", title: "Mail-Kontingent fast erreicht", detail: `${s.mailPercent} % des Tages- oder Monatskontingents sind verbraucht. Ab 80 % gehen nur noch wichtige Mails raus.` });
  }
  if (s.diskPercent !== null && s.diskPercent >= cfg.diskPercent) {
    alerts.push({ kind: "disk", title: "Speicherplatz knapp", detail: `Die Platte ist zu ${s.diskPercent} % belegt (Schwelle ${cfg.diskPercent} %). Alte Images und Build-Cache aufräumen oder das Volume vergrößern.` });
  }
  if (s.backup.configured) {
    if (s.backup.ageHours === null) {
      alerts.push({ kind: "backup", title: "Keine Sicherung gefunden", detail: "Es gibt keine Statusdatei einer erfolgreichen Sicherung. Backup-Timer und Skript prüfen." });
    } else if (s.backup.ok === false) {
      alerts.push({ kind: "backup", title: "Letzte Sicherung fehlgeschlagen", detail: "Die letzte Sicherung ist mit einem Fehler beendet worden. Protokoll des Backup-Dienstes prüfen." });
    } else if (s.backup.ageHours > cfg.backupMaxAgeHours) {
      alerts.push({ kind: "backup", title: "Sicherung zu alt", detail: `Die letzte erfolgreiche Sicherung ist ${Math.floor(s.backup.ageHours)} Stunden alt (Schwelle ${cfg.backupMaxAgeHours}).` });
    }
  }
  return alerts;
}

/**
 * Betriebsüberwachung: Worker-Lebenszeichen, Jobs, Mail-Kontingent, Platte, Backup-Alter.
 * Der Worker meldet sich alle 30 s im Cache-Redis (Ablauf 2 Min.); ein Job `ops.alert-check` (alle 5 Min., Worker)
 * bewertet die Lage und schickt je Ereignisart und Kalendertag höchstens EINE Mail an `OPERATOR_ALERT_EMAIL`
 * (über MailService, also mit Kostenbremse; Inhalt: feste Texte und Zahlen, keine Personendaten).
 * Ohne `OPERATOR_ALERT_EMAIL` wird nur angezeigt (Plattform-Seite, /metrics), nichts verschickt.
 */
@Injectable()
export class OpsService implements OnModuleInit {
  private readonly log = new Logger("Ops");
  private readonly cfg = opsConfigFromEnv();

  constructor(
    @Inject(CACHE) private readonly cache: Cache,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  onModuleInit() {
    this.jobs.define("ops.heartbeat", async () => this.cache.set(HEARTBEAT_KEY, new Date().toISOString(), HEARTBEAT_TTL_SEC));
    this.jobs.define("ops.alert-check", async () => {
      await this.notify(await this.status());
    });
    this.jobs.every("ops.heartbeat", HEARTBEAT_EVERY_MS);
    this.jobs.every("ops.alert-check", CHECK_EVERY_MS);
  }

  private async workerState(): Promise<OpsStatus["worker"]> {
    if (this.jobs.mode === "inline") return "inline";
    return (await this.cache.get(HEARTBEAT_KEY).catch(() => null)) ? "up" : "down";
  }

  private async jobCounts(): Promise<OpsStatus["jobs"]> {
    const c = await this.jobs.stats().catch(() => null);
    return c ? { waiting: c.waiting ?? 0, active: c.active ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0 } : null;
  }

  private async diskPercent(): Promise<number | null> {
    try {
      const s = await statfs(this.cfg.diskPath);
      if (!s.blocks) return null;
      return Math.round(((s.blocks - s.bavail) / s.blocks) * 100);
    } catch {
      return null;
    }
  }

  private async backupState(): Promise<OpsStatus["backup"]> {
    if (!this.cfg.backupStatusFile) return { configured: false, ageHours: null, ok: null, bytes: null };
    try {
      const raw = JSON.parse(await readFile(this.cfg.backupStatusFile, "utf8")) as { finishedAt?: string; ok?: boolean; bytes?: number };
      const at = raw.finishedAt ? Date.parse(raw.finishedAt) : NaN;
      return {
        configured: true,
        ageHours: Number.isFinite(at) ? Math.max(0, (Date.now() - at) / 3_600_000) : null,
        ok: typeof raw.ok === "boolean" ? raw.ok : null,
        bytes: typeof raw.bytes === "number" ? raw.bytes : null,
      };
    } catch {
      return { configured: true, ageHours: null, ok: null, bytes: null };
    }
  }

  async status(): Promise<OpsStatus> {
    const [worker, jobs, quota, disk, backup] = await Promise.all([
      this.workerState(),
      this.jobCounts(),
      this.mail.quota().catch(() => null),
      this.diskPercent(),
      this.backupState(),
    ]);
    const snapshot: OpsSnapshot = { worker, jobs, mailPercent: quota?.percent ?? null, diskPercent: disk, backup };
    return {
      checkedAt: new Date().toISOString(),
      alerts: evaluateAlerts(snapshot, this.cfg),
      worker,
      jobs,
      disk: disk === null ? null : { usedPercent: disk },
      backup,
      alertMail: this.cfg.alertEmail !== null,
    };
  }

  /** Eine Mail je Ereignisart und Kalendertag (atomarer Zähler im Cache: mehrere Worker schicken nicht doppelt). */
  async notify(status: OpsStatus): Promise<number> {
    if (!this.cfg.alertEmail) return 0;
    let sent = 0;
    for (const alert of status.alerts) {
      const first = (await this.cache.incr(`ops:alert:${alert.kind}:${berlinDate()}`, 2 * 24 * 3600).catch(() => 0)) === 1;
      if (!first) continue;
      const result = await this.mail.send(this.cfg.alertEmail, "ops-alert", { title: alert.title, detail: alert.detail, link: appLink("/plattform") });
      this.log.warn(`Alarm ${alert.kind}: Mail ${result}`);
      if (result === "queued") sent++;
    }
    return sent;
  }
}
