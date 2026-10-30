import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { HealthResponse } from "@vereine/shared";
import { CACHE, type Cache } from "./cache/cache.module";
import { DB, type Database } from "./db/db.module";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CACHE) private readonly cache: Cache,
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
    const body = { status: db && cache ? "ok" : "degraded", db: db ? "up" : "down", cache: cache ? `up (${this.cache.kind})` : "down" };
    if (!db || !cache) throw new ServiceUnavailableException(body);
    return body;
  }
}
