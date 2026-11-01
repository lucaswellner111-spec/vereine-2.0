import { timingSafeEqual } from "node:crypto";
import { Controller, Get, Header, Inject, NotFoundException, Req, UnauthorizedException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { DB, type Database } from "../db/db.module";
import { JobsService } from "../jobs/jobs.service";
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
    const extra = [
      "# TYPE klubnest_db_up gauge",
      `klubnest_db_up ${dbUp}`,
      ...(queue
        ? Object.entries(queue).flatMap(([k, v]) => (typeof v === "number" ? [`# TYPE klubnest_jobs_${k} gauge`, `klubnest_jobs_${k} ${v}`] : []))
        : []),
    ];
    return renderHttpMetrics() + extra.join("\n") + "\n";
  }
}
