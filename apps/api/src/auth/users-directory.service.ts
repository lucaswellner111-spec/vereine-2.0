import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { ConsentPurpose } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { consents, users } from "../db/schema";

/**
 * Einziger Lesezugang anderer Bereiche (social, chat, billing) auf Nutzerdaten des Bereichs `identity`.
 * Statt SQL-Joins auf identity.users wird hier nachgeschlagen. Zieht identity spaeter auf einen
 * eigenen Server, wird nur diese Klasse zu einem HTTP-/RPC-Aufruf (plus Cache) - kein Fachcode aendert sich.
 */
@Injectable()
export class UsersDirectory {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Anzeigenamen fuer viele Nutzer in EINER Abfrage (Reihenfolge egal, fehlende IDs fehlen im Ergebnis). */
  async names(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .select({ id: users.id, name: users.displayName })
      .from(users)
      .where(inArray(users.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** Letzter Stand einer Einwilligung (append-only Protokoll); ohne Eintrag = nicht erteilt. */
  async hasConsent(userId: string, purpose: ConsentPurpose): Promise<boolean> {
    const [row] = await this.db
      .select({ granted: consents.granted })
      .from(consents)
      .where(and(eq(consents.userId, userId), eq(consents.purpose, purpose)))
      .orderBy(desc(consents.createdAt))
      .limit(1);
    return row?.granted ?? false;
  }
}
