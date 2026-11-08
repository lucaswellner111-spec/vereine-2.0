import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AttendanceList, AttendanceStatus, PublicUser, RsvpState, SaveAttendanceInput } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { UsersDirectory } from "../auth/users-directory.service";
import { eventAttendance, eventRsvps, orgMembers, teamMembers } from "../db/schema";
import { EventsService, type EventRow } from "./events.service";

/** Wert der abgelehnten Zeile bei ON CONFLICT DO UPDATE. */
const sqlExcluded = (col: string) => sql.raw(`excluded."${col}"`);
/** Ab so kurz vor Beginn darf Anwesenheit erfasst werden. */
const OPEN_BEFORE_MS = 3600_000;

/**
 * Anwesenheit je Termin: nur Vorstand/Moderation lesen und schreiben. Bewusst nur da/fehlt/entschuldigt, kein
 * Freitext oder Grund (keine Gesundheitsdaten). Austritt loescht alle Eintraege der Person im Verein.
 */
@Injectable()
export class AttendanceService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
  ) {}

  /**
   * Kandidaten: Team-Termin = Teammitglieder, interner Termin = aktive Mitglieder, oeffentlicher Termin = Zusagen
   * aktiver Mitglieder; dazu alle, die schon einen Eintrag haben (damit er geloescht werden kann).
   */
  async list(user: PublicUser, eventId: string): Promise<AttendanceList> {
    const { row } = await this.manage(user, eventId);
    const publicEvent = row.visibility === "public" && !row.teamId;
    // Oeffentlich: nur Zusagen aktiver Mitglieder (per JOIN, nicht alle Mitglieder laden)
    const [candidates, marked, rsvps] = await Promise.all([
      publicEvent ? this.activeYes(row) : this.allowed(row),
      this.db.select({ userId: eventAttendance.userId, status: eventAttendance.status }).from(eventAttendance).where(eq(eventAttendance.eventId, eventId)),
      this.db.select({ userId: eventRsvps.userId, status: eventRsvps.status }).from(eventRsvps).where(eq(eventRsvps.eventId, eventId)),
    ]);
    const rsvpBy = new Map(rsvps.map((r) => [r.userId, r.status as RsvpState]));
    const statusBy = new Map(marked.map((m) => [m.userId, m.status as AttendanceStatus]));
    const ids = [...new Set([...candidates, ...statusBy.keys()])];
    const names = await this.directory.names(ids);
    return {
      entries: ids
        .filter((u) => names.has(u))
        .map((u) => ({ userId: u, name: names.get(u)!, status: statusBy.get(u) ?? null, rsvp: rsvpBy.get(u) ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
    };
  }

  /** Speichern in einem Rutsch; null loescht den Eintrag. Erst ab 1 h vor Beginn, nicht bei abgesagten Terminen. */
  async save(user: PublicUser, eventId: string, input: SaveAttendanceInput): Promise<AttendanceList> {
    const { item, row } = await this.manage(user, eventId);
    if (item.canceled) throw new BadRequestException("Der Termin wurde abgesagt.");
    if (Date.now() < row.startsAt.getTime() - OPEN_BEFORE_MS) throw new BadRequestException("Anwesenheit kann erst ab einer Stunde vor Beginn erfasst werden.");
    // Nur die uebergebenen Personen pruefen (kein Laden aller Mitglieder)
    const allowed = await this.allowed(row, input.entries.filter((e) => e.status !== null).map((e) => e.userId));
    const bad = input.entries.find((e) => e.status !== null && !allowed.has(e.userId));
    if (bad) throw new BadRequestException(row.teamId ? "Nur Mitglieder des Teams können erfasst werden." : "Nur aktive Vereinsmitglieder können erfasst werden.");

    const clear = input.entries.filter((e) => e.status === null).map((e) => e.userId);
    const set = input.entries.filter((e): e is { userId: string; status: AttendanceStatus } => e.status !== null);
    const now = new Date();
    await this.db.transaction(async (tx) => {
      if (clear.length) await tx.delete(eventAttendance).where(and(eq(eventAttendance.eventId, eventId), inArray(eventAttendance.userId, clear)));
      if (set.length) {
        await tx
          .insert(eventAttendance)
          .values(set.map((e) => ({ eventId, userId: e.userId, status: e.status, markedBy: user.id, markedAt: now })))
          .onConflictDoUpdate({
            target: [eventAttendance.eventId, eventAttendance.userId],
            set: { status: sqlExcluded("status"), markedBy: user.id, markedAt: now },
          });
      }
    });
    return this.list(user, eventId);
  }

  private async manage(user: PublicUser, eventId: string) {
    const loaded = await this.events.requireVisible(user, eventId);
    if (!loaded.item.canManage) throw new ForbiddenException("Nur Vorstand und Moderation erfassen die Anwesenheit.");
    return loaded;
  }

  /**
   * Wer erfasst werden darf: Teammitglieder (Team-Termin) bzw. aktive Vereinsmitglieder.
   * only: nur diese IDs pruefen (Speichern); ohne: alle Kandidaten (Liste).
   */
  private async allowed(row: EventRow, only?: string[]): Promise<Set<string>> {
    if (only && only.length === 0) return new Set();
    const active = and(eq(orgMembers.orgId, row.orgId), eq(orgMembers.status, "active"), only ? inArray(orgMembers.userId, only) : undefined);
    const rows = row.teamId
      ? await this.db
          .select({ userId: teamMembers.userId })
          .from(teamMembers)
          .innerJoin(orgMembers, and(eq(orgMembers.userId, teamMembers.userId), active))
          .where(eq(teamMembers.teamId, row.teamId))
      : await this.db.select({ userId: orgMembers.userId }).from(orgMembers).where(active);
    return new Set(rows.map((r) => r.userId));
  }

  /** Zusagen aktiver Mitglieder (oeffentliche Termine). */
  private async activeYes(row: EventRow): Promise<Set<string>> {
    const rows = await this.db
      .select({ userId: eventRsvps.userId })
      .from(eventRsvps)
      .innerJoin(orgMembers, and(eq(orgMembers.userId, eventRsvps.userId), eq(orgMembers.orgId, row.orgId), eq(orgMembers.status, "active")))
      .where(and(eq(eventRsvps.eventId, row.id), eq(eventRsvps.status, "yes")));
    return new Set(rows.map((r) => r.userId));
  }
}

