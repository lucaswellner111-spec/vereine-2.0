import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { HealthResponse } from "@vereine/shared";
import { CACHE, type Cache } from "./cache/cache.module";
import { DB, type Database } from "./db/db.module";
import { JobsService } from "./jobs/jobs.service";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CACHE) private readonly cache: Cache,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  @Get()
  check(): HealthResponse {
    return { status: "ok", service: "api", time: new Date().toISOString() };
  }

  /** Readiness: Datenbank und Cache muessen antworten (Load Balancer / Docker-Healthcheck). */
  @Get("ready")
  async ready() {
    const db = await this.db.execute(sql`select 1`).then(() => true, () => false);
    const cache = await this.cache.ping();
    // Warteschlange: viele wartende/fehlgeschlagene Jobs = Worker steht oder haengt (Alarm-Kriterium, nicht Bereitschaft)
    const queue = await this.jobs.stats().catch(() => null);
    const body = {
      status: db && cache ? "ok" : "degraded",
      db: db ? "up" : "down",
      cache: cache ? `up (${this.cache.kind})` : "down",
      jobs: queue ? { mode: this.jobs.mode, ...queue } : { mode: this.jobs.mode },
    };
    if (!db || !cache) throw new ServiceUnavailableException(body);
    return body;
  }
}
