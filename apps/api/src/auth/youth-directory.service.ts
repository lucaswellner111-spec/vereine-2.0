import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { guardianships, users, youthProfiles } from "../db/schema";

/**
 * Schmaler Lesezugang anderer Bereiche (social, members, billing, chat) auf Jugendkonten (Bereich identity), Pendant zu
 * UsersDirectory. Die Tabellen youth_profiles/guardianships kennt ausser identity niemand (db/boundaries.spec.ts).
 * Schreibzugriffe laufen nur ueber den GuardianService.
 */
@Injectable()
export class YouthDirectory {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Teilmenge der IDs, die Jugendkonten sind (nicht geloeschte). */
  async youthIds(ids: string[]): Promise<Set<string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Set();
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, unique), eq(users.accountType, "youth"), isNull(users.deletedAt)));
    return new Set(rows.map((r) => r.id));
  }

  async isYouth(id: string): Promise<boolean> {
    return (await this.youthIds([id])).has(id);
  }

  /** Aktiver Rechnungsempfaenger je Kind; Kinder ohne aktiven Empfaenger fehlen in der Map. */
  async billingContacts(youthIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(youthIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .select({ youth: guardianships.youthUserId, guardian: guardianships.guardianUserId })
      .from(guardianships)
      .innerJoin(users, and(eq(users.id, guardianships.guardianUserId), isNull(users.deletedAt)))
      .where(and(inArray(guardianships.youthUserId, unique), eq(guardianships.status, "active"), eq(guardianships.isBillingContact, true)));
    return new Map(rows.map((r) => [r.youth, r.guardian]));
  }

  /** Alle aktiven Elternteile je Kind (IDs). */
  async guardiansOf(youthId: string): Promise<string[]> {
    const rows = await this.db
      .select({ guardian: guardianships.guardianUserId })
      .from(guardianships)
      .innerJoin(users, and(eq(users.id, guardianships.guardianUserId), isNull(users.deletedAt)))
      .where(and(eq(guardianships.youthUserId, youthId), eq(guardianships.status, "active")));
    return rows.map((r) => r.guardian);
  }

  async isGuardianOf(guardianId: string, youthId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: guardianships.id })
      .from(guardianships)
      .where(and(eq(guardianships.guardianUserId, guardianId), eq(guardianships.youthUserId, youthId), eq(guardianships.status, "active")))
      .limit(1);
    return !!row;
  }

  /**
   * Voller Name (Vorstand/Kasse/Anwesenheit des Vereins, Eltern): bei Jugendkonten der volle Name, sonst der Anzeigename.
   * `UsersDirectory.names` liefert fuer Jugendkonten bewusst nur "Vorname + Initiale". Nur fuer berechtigte Dienste.
   */
  async fullNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .select({ id: users.id, name: users.displayName, full: youthProfiles.fullName })
      .from(users)
      .leftJoin(youthProfiles, eq(youthProfiles.userId, users.id))
      .where(and(inArray(users.id, unique), isNull(users.deletedAt)));
    return new Map(rows.map((r) => [r.id, r.full ?? r.name]));
  }

  /** Name des Rechnungsempfaengers (Elternteil) je Kind, fuer die Mitgliederliste des Vereins (ohne Kontaktdaten). */
  async billingContactNames(youthIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(youthIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .select({ youth: guardianships.youthUserId, name: users.displayName })
      .from(guardianships)
      .innerJoin(users, and(eq(users.id, guardianships.guardianUserId), isNull(users.deletedAt)))
      .where(and(inArray(guardianships.youthUserId, unique), eq(guardianships.status, "active"), eq(guardianships.isBillingContact, true)));
    return new Map(rows.map((r) => [r.youth, r.name]));
  }
}
