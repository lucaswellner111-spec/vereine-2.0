import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { ago, purgeInRounds, RETENTION, RETENTION_BATCH } from "../common/retention";
import { DB, type Database } from "../db/db.module";
import { mailSuppressions } from "../db/schema";
import { addressHash } from "./mail-limits";

/** all = harter Bounce/Beschwerde (blockt alles), invite = Abmeldung von Einladungs-Mails. */
export type SuppressionScope = "all" | "invite";
export type SuppressionReason = "unsubscribe" | "bounce" | "complaint";

/**
 * Sperrliste `mail.suppressions` (eigener Bereich, nur Hashes). Abmeldungen kommen ueber den Abmeldelink;
 * harte Bounces/Beschwerden sind vorbereitet (`recordBounce`), ein Webhook von Scaleway kann spaeter hier andocken.
 */
@Injectable()
export class SuppressionsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async add(hash: string, scope: SuppressionScope, reason: SuppressionReason): Promise<void> {
    await this.db.insert(mailSuppressions).values({ addressHash: hash, scope, reason }).onConflictDoNothing();
  }

  /** Fuer einen spaeteren Bounce-/Beschwerde-Webhook: Adresse fuer alle Mails sperren. */
  recordBounce(email: string, reason: "bounce" | "complaint" = "bounce"): Promise<void> {
    return this.add(addressHash(email), "all", reason);
  }

  /** Gesperrt fuer diese Mail-Art? Wichtige Auth-Mails beachten nur `all`, Einladungen zusaetzlich `invite`. */
  async isSuppressed(hash: string, scopes: SuppressionScope[]): Promise<boolean> {
    const [row] = await this.db
      .select({ h: mailSuppressions.addressHash })
      .from(mailSuppressions)
      .where(and(eq(mailSuppressions.addressHash, hash), inArray(mailSuppressions.scope, scopes)))
      .limit(1);
    return !!row;
  }

  /** Datenauskunft: Eintraege zur eigenen Adresse (ohne Hash). */
  async exportFor(email: string) {
    const rows = await this.db.select().from(mailSuppressions).where(eq(mailSuppressions.addressHash, addressHash(email)));
    return rows.map((r) => ({ scope: r.scope, reason: r.reason, at: r.createdAt.toISOString() }));
  }

  /**
   * Kontoloeschung: Bounce-Sperren der Kontoadresse entfallen (kein Konto mehr). Abmeldungen von Einladungen bleiben
   * bewusst bestehen (Widerspruch soll weiter gelten; nur ein Hash, Frist RETENTION.mailUnsubscribe).
   */
  async eraseFor(email: string): Promise<void> {
    await this.db.delete(mailSuppressions).where(and(eq(mailSuppressions.addressHash, addressHash(email)), eq(mailSuppressions.scope, "all")));
  }

  /** Loeschfristen (Job privacy.retention): Bounces/Beschwerden 12 Monate, Abmeldungen 36 Monate. */
  purgeExpired(): Promise<number> {
    return purgeInRounds(async () => {
      const keys = await this.db
        .select({ h: mailSuppressions.addressHash, s: mailSuppressions.scope })
        .from(mailSuppressions)
        .where(
          or(
            and(eq(mailSuppressions.reason, "unsubscribe"), lt(mailSuppressions.createdAt, ago(RETENTION.mailUnsubscribe))),
            and(sql`${mailSuppressions.reason} <> 'unsubscribe'`, lt(mailSuppressions.createdAt, ago(RETENTION.mailBounce))),
          ),
        )
        .limit(RETENTION_BATCH);
      if (!keys.length) return 0;
      const removed = await this.db
        .delete(mailSuppressions)
        .where(or(...keys.map((k) => and(eq(mailSuppressions.addressHash, k.h), eq(mailSuppressions.scope, k.s)))))
        .returning({ h: mailSuppressions.addressHash });
      return removed.length;
    });
  }
}
