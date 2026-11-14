import { timingSafeEqual } from "node:crypto";
import { Controller, Get, Header, Inject, NotFoundException, Req, UnauthorizedException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { DB, type Database } from "../db/db.module";
import { JobsService } from "../jobs/jobs.service";
import { OpsService } from "../ops/ops.service";
import { renderHttpMetrics } from "./http-metrics";

/**
 * Messwerte fuer Prometheus. Nur mit METRICS_TOKEN (Bearer) erreichbar; ohne Token existiert die Route nicht.
 * Der Reverse Proxy blockiert sie zusaetzlich nach aussen (Caddyfile): Prometheus fragt intern ab.
 */
@Controller("metrics")
export class MetricsController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(OpsService) private readonly ops: OpsService,
  ) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  @Header("Cache-Control", "no-store")
  async scrape(@Req() req: FastifyRequest): Promise<string> {
    const token = process.env.METRICS_TOKEN;
    if (!token) throw new NotFoundException();
    const given = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
    const expected = Buffer.from(token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new UnauthorizedException();

    const dbUp = await this.db.execute(sql`select 1`).then(() => 1, () => 0);
    const queue = await this.jobs.stats().catch(() => null);
    const ops = await this.ops.status().catch(() => null);
    const opsLines = ops
      ? [
          "# TYPE klubnest_worker_up gauge",
          `klubnest_worker_up ${ops.worker === "down" ? 0 : 1}`,
          ...(ops.disk ? ["# TYPE klubnest_disk_used_percent gauge", `klubnest_disk_used_percent ${ops.disk.usedPercent}`] : []),
          ...(ops.backup.configured
            ? [
                "# TYPE klubnest_backup_age_seconds gauge",
                // ohne Sicherung: bewusst riesiger Wert, damit die Alarmregel (> 30 h) greift
                `klubnest_backup_age_seconds ${ops.backup.ageHours === null ? 999999999 : Math.round(ops.backup.ageHours * 3600)}`,
                "# TYPE klubnest_backup_ok gauge",
                `klubnest_backup_ok ${ops.backup.ok === false ? 0 : 1}`,
              ]
            : []),
          "# TYPE klubnest_alert_active gauge",
          ...["worker", "jobs-failed", "jobs-backlog", "mail-quota", "disk", "backup"].map((k) => `klubnest_alert_active{kind="${k}"} ${ops.alerts.some((a) => a.kind === k) ? 1 : 0}`),
        ]
      : [];
    const extra = [
      ...opsLines,
      "# TYPE klubnest_db_up gauge",
      `klubnest_db_up ${dbUp}`,
      ...(queue
        ? Object.entries(queue).flatMap(([k, v]) => (typeof v === "number" ? [`# TYPE klubnest_jobs_${k} gauge`, `klubnest_jobs_${k} ${v}`] : []))
        : []),
    ];
    return renderHttpMetrics() + extra.join("\n") + "\n";
  }
}
