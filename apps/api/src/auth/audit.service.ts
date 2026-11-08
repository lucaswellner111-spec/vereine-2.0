import { Inject, Injectable } from "@nestjs/common";
import { and, inArray, lt, or, sql } from "drizzle-orm";
import { ago, purgeInRounds, RETENTION, RETENTION_BATCH } from "../common/retention";
import { DB, type Database } from "../db/db.module";
import { auditLog } from "../db/schema";

/** Moderationsaktionen mit laengerer Frist (zusaetzlich alles mit `platform.`). */
const MODERATION_ACTIONS = ["post.hidden", "post.unhidden", "comment.deleted"];

/** Zugriffsprotokoll (Bereich identity). Andere Bereiche schreiben ueber diesen Dienst, nicht in die Tabelle. */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(userId: string | null, action: string, meta?: Record<string, unknown>): Promise<void> {
    await this.db.insert(auditLog).values({ userId, action, meta: meta ?? null });
  }

  /** Loeschfrist (Job privacy.retention): 12 Monate; Moderation 24 Monate; Rechnungsaktionen 10 Jahre. Blockweise. */
  purgeExpired(): Promise<number> {
    const finance = sql`${auditLog.action} like 'invoice.%'`;
    const moderation = or(sql`${auditLog.action} like 'platform.%'`, inArray(auditLog.action, MODERATION_ACTIONS))!;
    const expired = or(
      and(finance, lt(auditLog.createdAt, ago(RETENTION.auditFinance))),
      and(moderation, lt(auditLog.createdAt, ago(RETENTION.auditModeration))),
      and(sql`not (${finance})`, sql`not (${moderation})`, lt(auditLog.createdAt, ago(RETENTION.auditDefault))),
    );
    return purgeInRounds(async () => {
      const ids = this.db.select({ id: auditLog.id }).from(auditLog).where(expired).limit(RETENTION_BATCH);
      return (await this.db.delete(auditLog).where(inArray(auditLog.id, ids)).returning({ id: auditLog.id })).length;
    });
  }
}
