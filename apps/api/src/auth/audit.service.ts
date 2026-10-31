import { Inject, Injectable } from "@nestjs/common";
import { DB, type Database } from "../db/db.module";
import { auditLog } from "../db/schema";

/** Zugriffsprotokoll (Bereich identity). Andere Bereiche schreiben ueber diesen Dienst, nicht in die Tabelle. */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(userId: string | null, action: string, meta?: Record<string, unknown>): Promise<void> {
    await this.db.insert(auditLog).values({ userId, action, meta: meta ?? null });
  }
}
