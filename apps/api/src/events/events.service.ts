import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  CreateEventInput,
  EventAttendees,
  EventItem,
  EventKind,
  OrgRole,
  PublicUser,
  RsvpItem,
  RsvpState,
  RsvpStatus,
  UpdateEventInput,
} from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { pgCode } from "../common/pg-errors";
import { UsersDirectory } from "../auth/users-directory.service";
import { JobsService } from "../jobs/jobs.service";
import { eventAttendance, eventRsvps, eventShiftSignups, eventShifts, events, follows, orgMembers, organizations, teamMembers, teams } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { OrgsService } from "../orgs/orgs.service";
import { ProfileAccess } from "../profiles/profile-access.service";
import { buildIcs, buildIcsFeed } from "./ics";
import { occurrences } from "./recurrence";

const STAFF: OrgRole[] = ["admin", "moderator"];
const REMINDER_LEAD_MS = 24 * 3600_000;
const REMINDER_INTERVAL_MS = 10 * 60_000;
const WAITLIST_INTERVAL_MS = 10 * 60_000;
/** Ohne Ende gilt ein Termin 3 h nach Beginn als vorbei. */
const DEFAULT_DURATION_MS = 3 * 3600_000;
const DAY_MS = 86400_000;
/** Zeitraeume bis 42 Tage (Monatsansicht mit Randwochen; +2 h Spielraum fuer die Zeitumstellung) liefern mehr Termine. */
const MONTH_WINDOW_MS = 42 * DAY_MS + 2 * 3600_000;
/** Hoechstens so viele Nachruecker je Termin und Durchlauf (Rest beim naechsten Job). */
const FILL_MAX = 1000;

type Viewer = { roles: Map<string, OrgRole>; follows: Set<string>; teams: Set<string> };
export type EventRange = { from?: string; to?: string; past?: boolean; before?: string };
export type EventRow = typeof events.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Termin vorbei (Ende bzw. Beginn + 3 h liegt vor jetzt)? */
export function eventEnded(e: { startsAt: Date | string; endsAt: Date | string | null }, now = new Date()): boolean {
  const end = e.endsAt ? new Date(e.endsAt) : new Date(new Date(e.startsAt).getTime() + DEFAULT_DURATION_MS);
  return end < now;
}
/** CHECK verletzt (23514), z. B. events_yes_count_chk bei vollem Termin. */
export const isCheckViolation = (err: unknown) => pgCode(err) === "23514";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class EventsService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(ProfileAccess) private readonly access: ProfileAccess,
  ) {}

  onModuleInit() {
    // Der atomare Claim in sendDueReminders() macht mehrere Worker gefahrlos.
    this.jobs.define("events.reminders", async () => void (await this.sendDueReminders()));
    this.jobs.every("events.reminders", REMINDER_INTERVAL_MS);
    // Sicherheitsnetz: freie Plaetze (z. B. nach Kontoloeschung per Kaskade) aus der Warteliste fuellen.
    // SKIP LOCKED in fillWaitlist() macht parallele Worker gefahrlos.
    this.jobs.define("events.waitlist-fill", async () => void (await this.fillAllWaitlists()));
    this.jobs.every("events.waitlist-fill", WAITLIST_INTERVAL_MS);
  }

  // --- Lesen ------------------------------------------------------------------

  /**
   * Kalender des Nutzers. Sichtbar sind: oeffentliche Termine gefolgter/eigener Vereine, interne
   * Vereinstermine (Mitglieder), Team-Termine (Teammitglieder) und alle Termine fuer Vorstand/Moderation.
   * past: vergangene Termine absteigend (Seiten per to + before). Zeitraum bis 42 Tage: bis 300 Termine.
   * SKALIERUNG: Index events(org_id, starts_at); begrenzt auf 100 (Monat 300) Termine je Abfrage + Zeitfenster.
   */
  async listMine(user: PublicUser, range: EventRange): Promise<EventItem[]> {
    return this.query(user, undefined, range);
  }

  async listForOrg(user: PublicUser, slug: string, range: EventRange): Promise<EventItem[]> {
    const org = await this.orgs.requireBySlug(slug);
    return this.query(user, eq(events.orgId, org.id), range);
  }

  async get(user: PublicUser, id: string): Promise<EventItem> {
    const [item] = await this.query(user, eq(events.id, id), { from: "1970-01-01T00:00:00Z" });
    if (!item) throw new NotFoundException("Termin nicht gefunden.");
    return item;
  }

  /** Sichtbarer Termin samt Rohzeile (orgId, teamId) fuer Helferlisten und Anwesenheit. */
  async requireVisible(user: PublicUser, id: string): Promise<{ item: EventItem; row: EventRow }> {
    const item = await this.get(user, id);
    const [row] = await this.db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!row) throw new NotFoundException("Termin nicht gefunden.");
    return { item, row };
  }

  async participants(user: PublicUser, id: string): Promise<RsvpItem[]> {
    const event = await this.get(user, id);
    if (!event.canManage) throw new ForbiddenException("Nur Vorstand und Moderation sehen die Teilnehmerliste.");
    const rows = await this.db
      .select({ userId: eventRsvps.userId, status: eventRsvps.status })
      .from(eventRsvps)
      .where(eq(eventRsvps.eventId, id))
      .limit(2000);
    const names = await this.directory.names(rows.map((r) => r.userId));
    return rows
      .map((r) => ({ userId: r.userId, name: names.get(r.userId) ?? "Gelöschter Nutzer", status: r.status as RsvpState }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  /**
   * Zusagen fuer Teilnehmende: nur aktive Vereinsmitglieder sehen bei internen/Team-Terminen Namen und Avatar
   * (Datenminimierung: kein Vielleicht/Nein, keine E-Mail). Oeffentliche Termine und Follower: nur die Anzahl.
   */
  async attendees(user: PublicUser, id: string): Promise<EventAttendees> {
    const event = await this.get(user, id); // 404, wenn der Termin nicht sichtbar ist
    const total = event.counts.yes;
    const [row] = await this.db.select({ orgId: events.orgId, teamId: events.teamId }).from(events).where(eq(events.id, id)).limit(1);
    const role = row ? await this.orgs.activeRole(row.orgId, user.id) : null;
    if (!row || event.visibility === "public" || !role) return { visible: false, total, people: [] };
    const ids = await this.activeYes(row, id);
    const people = await this.people(ids);
    // Anzahl passend zu den gezeigten Personen (ohne Ausgetretene)
    return { visible: true, total: people.length, people };
  }

  /** Nutzer-IDs mit Zusage, die noch aktive Mitglieder (bei Team-Terminen: noch im Team) sind. */
  private async activeYes(row: { orgId: string; teamId: string | null }, id: string): Promise<string[]> {
    const conds: SQL[] = [eq(eventRsvps.eventId, id), eq(eventRsvps.status, "yes")];
    if (row.teamId) {
      conds.push(sql`exists (select 1 from ${teamMembers} where ${teamMembers.teamId} = ${row.teamId} and ${teamMembers.userId} = ${eventRsvps.userId})`);
    }
    const rows = await this.db
      .select({ userId: eventRsvps.userId })
      .from(eventRsvps)
      .innerJoin(orgMembers, and(eq(orgMembers.orgId, row.orgId), eq(orgMembers.userId, eventRsvps.userId), eq(orgMembers.status, "active")))
      .where(and(...conds))
      .limit(500);
    return rows.map((r) => r.userId);
  }

  /** Name, Handle, Avatar; geloeschte Konten fallen heraus. */
  async people(ids: string[]) {
    const [names, profs] = await Promise.all([this.directory.names(ids), this.access.ensureMany(ids)]);
    return ids
      .filter((uid) => names.has(uid))
      .map((uid) => ({ userId: uid, name: names.get(uid)!, handle: profs.get(uid)?.handle ?? null, avatarId: profs.get(uid)?.avatarMediaId ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  async ics(user: PublicUser, id: string): Promise<string> {
    const e = await this.get(user, id);
    return buildIcs({
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      startsAt: new Date(e.startsAt),
      endsAt: e.endsAt ? new Date(e.endsAt) : null,
      canceled: e.canceled,
      orgName: e.orgName,
    });
  }

  /**
   * Anwesenheitsquote der letzten 90 Tage (begonnene, nicht abgesagte Termine mit Eintraegen):
   * Anteil "da" an allen Eintraegen. Nur Zahlen, keine Personen.
   */
  async attendanceStats(orgId: string): Promise<{ rate: number | null; events: number }> {
    const now = new Date();
    const [row] = await this.db
      .select({
        present: sql<number>`count(*) filter (where ${eventAttendance.status} = 'present')::int`,
        total: sql<number>`count(*)::int`,
        events: sql<number>`count(distinct ${eventAttendance.eventId})::int`,
      })
      .from(eventAttendance)
      .innerJoin(events, eq(events.id, eventAttendance.eventId))
      .where(and(eq(events.orgId, orgId), isNull(events.canceledAt), gte(events.startsAt, new Date(now.getTime() - 90 * DAY_MS)), lte(events.startsAt, now)));
    const total = row?.total ?? 0;
    return { rate: total ? Math.round((row!.present / total) * 1000) / 1000 : null, events: row?.events ?? 0 };
  }

  /** Bedingung: Person ist kein aktives Mitglied des Vereins (bei Team-Terminen: nicht im Team). */
  private outsider(userCol: typeof eventRsvps.userId | typeof eventShiftSignups.userId, orgId: string, teamId: string | null): SQL {
    const member = sql`exists (select 1 from ${orgMembers} where ${orgMembers.orgId} = ${orgId} and ${orgMembers.userId} = ${userCol} and ${orgMembers.status} = 'active')`;
    const inTeam = teamId ? sql` and exists (select 1 from ${teamMembers} where ${teamMembers.teamId} = ${teamId} and ${teamMembers.userId} = ${userCol})` : sql``;
    return sql`not (${member}${inTeam})`;
  }

  /** Datenauskunft (Art. 15): eigene Zu-/Absagen, Helfer-Eintragungen und Anwesenheit. */
  async exportFor(userId: string) {
    const [rsvps, shifts, attendance] = await Promise.all([
      this.db
        .select({ r: eventRsvps, title: events.title, startsAt: events.startsAt })
        .from(eventRsvps)
        .innerJoin(events, eq(events.id, eventRsvps.eventId))
        .where(eq(eventRsvps.userId, userId)),
      this.db
        .select({ s: eventShiftSignups, title: eventShifts.title, eventId: eventShifts.eventId, eventTitle: events.title, eventStartsAt: events.startsAt })
        .from(eventShiftSignups)
        .innerJoin(eventShifts, eq(eventShifts.id, eventShiftSignups.shiftId))
        .innerJoin(events, eq(events.id, eventShifts.eventId))
        .where(eq(eventShiftSignups.userId, userId)),
      this.db
        .select({ a: eventAttendance, title: events.title, startsAt: events.startsAt })
        .from(eventAttendance)
        .innerJoin(events, eq(events.id, eventAttendance.eventId))
        .where(eq(eventAttendance.userId, userId)),
    ]);
    return {
      responses: rsvps.map(({ r, title, startsAt }) => ({
        eventId: r.eventId,
        eventTitle: title,
        eventStartsAt: startsAt.toISOString(),
        status: r.status,
        waitlistedAt: r.waitlistedAt?.toISOString() ?? null,
        at: r.updatedAt.toISOString(),
      })),
      helperShifts: shifts.map((x) => ({
        shiftId: x.s.shiftId,
        shiftTitle: x.title,
        eventId: x.eventId,
        eventTitle: x.eventTitle,
        eventStartsAt: x.eventStartsAt.toISOString(),
        at: x.s.createdAt.toISOString(),
      })),
      attendance: attendance.map(({ a, title, startsAt }) => ({ eventId: a.eventId, eventTitle: title, eventStartsAt: startsAt.toISOString(), status: a.status, at: a.markedAt.toISOString() })),
    };
  }

  // --- Schreiben --------------------------------------------------------------

  async create(user: PublicUser, slug: string, input: CreateEventInput): Promise<EventItem> {
    const org = await this.orgs.requireBySlug(slug);
    const role = await this.orgs.activeRole(org.id, user.id);
    if (!role || !STAFF.includes(role)) throw new ForbiddenException("Nur Vorstand und Moderation duerfen Termine anlegen.");

    if (input.teamId) {
      const [team] = await this.db
        .select()
        .from(teams)
        .where(and(eq(teams.id, input.teamId), eq(teams.orgId, org.id)))
        .limit(1);
      if (!team) throw new BadRequestException("Dieses Team gehoert nicht zum Verein.");
    }

    const start = new Date(input.startsAt);
    const duration = input.endsAt ? new Date(input.endsAt).getTime() - start.getTime() : null;
    const starts = input.repeat ? occurrences(start, input.repeat) : [start];
    const seriesId = input.repeat ? randomUUID() : null;
    const created = await this.db
      .insert(events)
      .values(
        starts.map((s) => ({
          orgId: org.id,
          teamId: input.teamId ?? null,
          title: input.title,
          description: input.description,
          location: input.location,
          startsAt: s,
          endsAt: duration === null ? null : new Date(s.getTime() + duration),
          visibility: input.visibility,
          kind: input.kind,
          capacity: input.capacity ?? null,
          seriesId,
          createdBy: user.id,
        })),
      )
      .returning();
    const row = created[0];

    // Empfaenger: Teammitglieder bzw. alle aktiven Vereinsmitglieder (ohne den Ersteller).
    const recipients = input.teamId
      ? await this.db.select({ id: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, input.teamId))
      : await this.db
          .select({ id: orgMembers.userId })
          .from(orgMembers)
          .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.status, "active")));
    await this.notifications.notify(
      recipients.map((r) => r.id).filter((id) => id !== user.id),
      "event_created",
      { eventId: row.id, title: row.title, orgSlug: org.slug, orgName: org.name, startsAt: row.startsAt.toISOString(), ...(input.repeat ? { series: String(created.length) } : {}) },
    );
    return this.get(user, row.id);
  }

  /**
   * Termin bearbeiten (Vorstand/Moderation, nicht abgesagt/vorbei). scope "series": Titel, Beschreibung, Ort,
   * Sichtbarkeit, Art und Limit fuer diesen und alle spaeteren Termine; Datum/Uhrzeit nur fuer diesen.
   * Limit unter den Zusagen: 400; hoeheres/kein Limit zieht die Warteliste nach. Benachrichtigt Zusagen,
   * Vielleicht und Warteliste nur bei geaenderter Zeit, Ort oder Titel.
   */
  async update(user: PublicUser, id: string, input: UpdateEventInput): Promise<EventItem> {
    const event = await this.get(user, id);
    if (!event.canManage) throw new ForbiddenException("Nur Vorstand und Moderation duerfen Termine bearbeiten.");
    if (event.canceled) throw new BadRequestException("Der Termin wurde abgesagt.");
    if (eventEnded(event)) throw new BadRequestException("Der Termin liegt in der Vergangenheit.");

    const oldStart = new Date(event.startsAt);
    const oldEnd = event.endsAt ? new Date(event.endsAt) : null;
    const newStart = input.startsAt ? new Date(input.startsAt) : oldStart;
    const newEnd = input.endsAt === undefined ? oldEnd : input.endsAt === null ? null : new Date(input.endsAt);
    if (newEnd && newEnd <= newStart) throw new BadRequestException("Das Ende muss nach dem Beginn liegen.");
    const startChanged = newStart.getTime() !== oldStart.getTime();
    if (startChanged && newStart < new Date()) throw new BadRequestException("Der neue Beginn liegt in der Vergangenheit.");
    const timeChanged = startChanged || (newEnd?.getTime() ?? null) !== (oldEnd?.getTime() ?? null);
    const titleChanged = input.title !== undefined && input.title !== event.title;
    const locationChanged = input.location !== undefined && input.location !== event.location;

    const common: Partial<EventRow> = {};
    if (input.title !== undefined) common.title = input.title;
    if (input.description !== undefined) common.description = input.description;
    if (input.location !== undefined) common.location = input.location;
    if (input.visibility !== undefined) common.visibility = input.visibility;
    if (input.kind !== undefined) common.kind = input.kind;
    if (input.capacity !== undefined) common.capacity = input.capacity;
    const wholeSeries = input.scope === "series" && !!event.seriesId;

    const { targets, promoted } = await this.db.transaction(async (tx) => {
      const targets = await tx
        .select({ id: events.id, yesCount: events.yesCount, visibility: events.visibility, orgId: events.orgId, teamId: events.teamId })
        .from(events)
        .where(wholeSeries ? and(eq(events.seriesId, event.seriesId!), gte(events.startsAt, oldStart), isNull(events.canceledAt)) : eq(events.id, id))
        .orderBy(asc(events.id))
        .for("update");
      if (input.capacity != null) {
        const over = targets.find((t) => t.yesCount > input.capacity!);
        if (over) throw new BadRequestException(`Das Limit ist kleiner als die Zahl der Zusagen (${over.yesCount}).`);
      }
      const ids = targets.map((t) => t.id);
      if (ids.length) await tx.update(events).set({ ...common, updatedAt: new Date() }).where(inArray(events.id, ids));
      if (timeChanged) {
        // Neue Startzeit: Erinnerung erneut faellig
        await tx.update(events).set({ startsAt: newStart, endsAt: newEnd, ...(startChanged ? { remindedAt: null } : {}) }).where(eq(events.id, id));
      }
      // Oeffentlich -> intern: Zusagen, Warteliste und Helfer-Eintraege von Personen ohne Mitgliedschaft (bzw. ohne Team) entfernen
      const narrowed = input.visibility === "members" ? targets.filter((t) => t.visibility === "public") : [];
      for (const t of narrowed) {
        await tx.delete(eventRsvps).where(and(eq(eventRsvps.eventId, t.id), this.outsider(eventRsvps.userId, t.orgId, t.teamId)));
        const shiftIds = tx.select({ id: eventShifts.id }).from(eventShifts).where(eq(eventShifts.eventId, t.id));
        await tx
          .delete(eventShiftSignups)
          .where(and(inArray(eventShiftSignups.shiftId, shiftIds), this.outsider(eventShiftSignups.userId, t.orgId, t.teamId)));
      }
      const refill = new Set([...(input.capacity !== undefined ? ids : []), ...narrowed.map((t) => t.id)]);
      const promoted = new Map<string, string[]>();
      for (const t of refill) promoted.set(t, await this.fillWaitlist(tx, t));
      return { targets: ids, promoted };
    });

    for (const [eventId, userIds] of promoted) await this.notifyPromoted(eventId, userIds);
    if (timeChanged || titleChanged || locationChanged) {
      // Titel/Ort betreffen alle Ziele, Zeit nur diesen Termin
      const affected = titleChanged || locationChanged ? targets : [id];
      const rows = await this.db
        .selectDistinct({ userId: eventRsvps.userId })
        .from(eventRsvps)
        .where(and(inArray(eventRsvps.eventId, affected), inArray(eventRsvps.status, ["yes", "maybe", "waitlist"])));
      await this.notifications.notify(
        rows.map((r) => r.userId).filter((u) => u !== user.id),
        "event_updated",
        {
          eventId: id,
          title: input.title ?? event.title,
          orgSlug: event.orgSlug,
          orgName: event.orgName,
          startsAt: newStart.toISOString(),
          ...(affected.length > 1 ? { series: String(affected.length) } : {}),
        },
      );
    }
    return this.get(user, id);
  }

  /** scope "series": dieser und alle spaeteren Termine der Serie. */
  async cancel(user: PublicUser, id: string, scope: "single" | "series" = "single"): Promise<void> {
    const event = await this.get(user, id);
    if (!event.canManage) throw new ForbiddenException("Nur Vorstand und Moderation duerfen Termine absagen.");
    const wholeSeries = scope === "series" && !!event.seriesId;
    if (event.canceled && !wholeSeries) return;
    const target = wholeSeries
      ? and(eq(events.seriesId, event.seriesId!), gte(events.startsAt, new Date(event.startsAt)), isNull(events.canceledAt))!
      : eq(events.id, id);
    const canceled = await this.db.update(events).set({ canceledAt: new Date() }).where(target).returning({ id: events.id });
    const attendees = await this.db
      .select({ userId: eventRsvps.userId })
      .from(eventRsvps)
      .where(and(inArray(eventRsvps.eventId, canceled.length ? canceled.map((c) => c.id) : [id]), inArray(eventRsvps.status, ["yes", "maybe", "waitlist"])));
    await this.notifications.notify(
      attendees.map((a) => a.userId).filter((u) => u !== user.id),
      "event_canceled",
      { eventId: id, title: event.title, orgSlug: event.orgSlug, orgName: event.orgName, startsAt: event.startsAt, ...(wholeSeries ? { series: String(canceled.length) } : {}) },
    );
  }

  /** Abo-Kalender eines Nutzers: sichtbare Termine der letzten 30 und naechsten 180 Tage (max. 500). */
  async icsFeed(userId: string): Promise<string> {
    const items = await this.query(
      { id: userId } as PublicUser,
      undefined,
      { from: new Date(Date.now() - 30 * DAY_MS).toISOString(), to: new Date(Date.now() + 180 * DAY_MS).toISOString() },
      500,
    );
    return buildIcsFeed(
      items.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        location: e.location,
        startsAt: new Date(e.startsAt),
        endsAt: e.endsAt ? new Date(e.endsAt) : null,
        canceled: e.canceled,
        orgName: e.orgName,
      })),
    );
  }

  /**
   * Zu-/Absage. Mit Limit atomar: Die Zusage laeuft in einem Savepoint; ist der Termin voll, scheitert sie am
   * CHECK events_yes_count_chk (23514) und die Person kommt auf die Warteliste. Wer von "Zusage" weggeht, macht
   * Platz fuer die erste Person der Warteliste. Benachrichtigung erst nach dem Commit.
   */
  async rsvp(user: PublicUser, id: string, status: RsvpStatus): Promise<EventItem> {
    const event = await this.get(user, id);
    if (event.canceled) throw new BadRequestException("Der Termin wurde abgesagt.");
    if (eventEnded(event)) throw new BadRequestException("Der Termin liegt in der Vergangenheit.");
    const promoted = await this.db.transaction(async (tx) => {
      const [prev] = await tx
        .select({ status: eventRsvps.status })
        .from(eventRsvps)
        .where(and(eq(eventRsvps.eventId, id), eq(eventRsvps.userId, user.id)))
        .for("update");
      const put = (db: Tx, s: RsvpState, waitlistedAt: Date | null) =>
        db
          .insert(eventRsvps)
          .values({ eventId: id, userId: user.id, status: s, waitlistedAt })
          .onConflictDoUpdate({ target: [eventRsvps.eventId, eventRsvps.userId], set: { status: s, waitlistedAt, updatedAt: new Date() } });
      if (status === "yes") {
        if (prev?.status === "yes" || prev?.status === "waitlist") return [];
        // Fair: freie Plaetze gehen zuerst an die Warteliste
        const before = await this.fillWaitlist(tx, id);
        try {
          await tx.transaction(async (sp) => void (await put(sp, "yes", null)));
        } catch (err) {
          if (!isCheckViolation(err)) throw err;
          await put(tx, "waitlist", new Date());
        }
        return before;
      }
      await put(tx, status, null);
      return prev?.status === "yes" ? this.fillWaitlist(tx, id) : [];
    });
    await this.notifyPromoted(id, promoted);
    return this.get(user, id);
  }

  /**
   * Fuellt freie Plaetze aus der Warteliste (aelteste zuerst). Jede Befoerderung im Savepoint; der CHECK beendet
   * die Schleife, sobald der Termin voll ist. FOR UPDATE SKIP LOCKED: parallele Aufrufe nehmen nie dieselbe Person.
   * Liefert die Nachgerueckten (Benachrichtigung macht der Aufrufer nach dem Commit).
   */
  async fillWaitlist(tx: Tx, eventId: string): Promise<string[]> {
    const [e] = await tx
      .select({ capacity: events.capacity, yesCount: events.yesCount, canceledAt: events.canceledAt, startsAt: events.startsAt, endsAt: events.endsAt })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    if (!e || e.canceledAt || eventEnded(e)) return [];
    if (e.capacity !== null && e.yesCount >= e.capacity) return [];
    const out: string[] = [];
    while (out.length < FILL_MAX) {
      const [next] = await tx
        .select({ userId: eventRsvps.userId })
        .from(eventRsvps)
        .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.status, "waitlist")))
        .orderBy(asc(eventRsvps.waitlistedAt), asc(eventRsvps.userId))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!next) break;
      try {
        await tx.transaction(async (sp) => {
          await sp
            .update(eventRsvps)
            .set({ status: "yes", waitlistedAt: null, updatedAt: new Date() })
            .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, next.userId)));
        });
      } catch (err) {
        if (isCheckViolation(err)) break; // voll
        throw err;
      }
      out.push(next.userId);
    }
    return out;
  }

  /** Nachruecken fuer einzelne Termine in eigenen Transaktionen (z. B. nach Austritt), samt Benachrichtigung. */
  async fillWaitlistsFor(eventIds: string[]): Promise<number> {
    let n = 0;
    for (const id of [...new Set(eventIds)]) {
      const promoted = await this.db.transaction((tx) => this.fillWaitlist(tx, id));
      await this.notifyPromoted(id, promoted);
      n += promoted.length;
    }
    return n;
  }

  /** Job events.waitlist-fill: kuenftige Termine mit freien Plaetzen und Warteliste (max. 200 je Lauf). */
  async fillAllWaitlists(): Promise<number> {
    const rows = await this.db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          isNull(events.canceledAt),
          gt(sql`coalesce(${events.endsAt}, ${events.startsAt} + interval '3 hours')`, new Date()),
          or(isNull(events.capacity), lt(events.yesCount, events.capacity)),
          sql`exists (select 1 from ${eventRsvps} where ${eventRsvps.eventId} = ${events.id} and ${eventRsvps.status} = 'waitlist')`,
        ),
      )
      .limit(200);
    return this.fillWaitlistsFor(rows.map((r) => r.id));
  }

  private async notifyPromoted(eventId: string, userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    const [e] = await this.db
      .select({ title: events.title, startsAt: events.startsAt, orgSlug: organizations.slug, orgName: organizations.name })
      .from(events)
      .innerJoin(organizations, eq(organizations.id, events.orgId))
      .where(eq(events.id, eventId))
      .limit(1);
    if (!e) return;
    await this.notifications.notify(userIds, "event_waitlist_promoted", {
      eventId,
      title: e.title,
      orgSlug: e.orgSlug,
      orgName: e.orgName,
      startsAt: e.startsAt.toISOString(),
    });
  }

  /** Erinnerung ~24 h vor Beginn an Zusagen/Vielleicht. Atomarer Claim: jeder Termin wird genau einmal verarbeitet. */
  async sendDueReminders(now = new Date()): Promise<number> {
    const claimed = await this.db
      .update(events)
      .set({ remindedAt: now })
      .where(
        and(
          isNull(events.remindedAt),
          isNull(events.canceledAt),
          gt(events.startsAt, now),
          lte(events.startsAt, new Date(now.getTime() + REMINDER_LEAD_MS)),
        ),
      )
      .returning();
    for (const e of claimed) {
      const [org] = await this.db.select().from(organizations).where(eq(organizations.id, e.orgId)).limit(1);
      const attendees = await this.db
        .select({ userId: eventRsvps.userId })
        .from(eventRsvps)
        .where(and(eq(eventRsvps.eventId, e.id), inArray(eventRsvps.status, ["yes", "maybe"])));
      await this.notifications.notify(attendees.map((a) => a.userId), "event_reminder", {
        eventId: e.id,
        title: e.title,
        orgSlug: org?.slug ?? "",
        orgName: org?.name ?? "",
        startsAt: e.startsAt.toISOString(),
      });
    }
    return claimed.length;
  }

  // --- intern -----------------------------------------------------------------

  private async viewer(userId: string): Promise<Viewer> {
    const [members, followed, myTeams] = await Promise.all([
      this.db
        .select({ orgId: orgMembers.orgId, role: orgMembers.role })
        .from(orgMembers)
        .where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, "active"))),
      this.db.select({ orgId: follows.orgId }).from(follows).where(eq(follows.userId, userId)),
      this.db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId)),
    ]);
    return {
      roles: new Map(members.map((m) => [m.orgId, m.role as OrgRole])),
      follows: new Set(followed.map((f) => f.orgId)),
      teams: new Set(myTeams.map((t) => t.teamId)),
    };
  }

  private visibleWhere(v: Viewer): SQL {
    const memberOrgs = [...v.roles.keys()];
    const staffOrgs = [...v.roles].filter(([, r]) => STAFF.includes(r)).map(([id]) => id);
    const publicOrgs = [...new Set([...memberOrgs, ...v.follows])];
    const parts: SQL[] = [];
    if (publicOrgs.length) parts.push(and(eq(events.visibility, "public"), inArray(events.orgId, publicOrgs))!);
    if (memberOrgs.length) parts.push(and(isNull(events.teamId), inArray(events.orgId, memberOrgs))!);
    if (v.teams.size) parts.push(inArray(events.teamId, [...v.teams]));
    if (staffOrgs.length) parts.push(inArray(events.orgId, staffOrgs));
    return parts.length ? or(...parts)! : sql`false`;
  }

  private async query(user: PublicUser, extra: SQL | undefined, range: EventRange, limitOverride?: number): Promise<EventItem[]> {
    const v = await this.viewer(user.id);
    const now = new Date();
    const past = !!range.past;
    const from = range.from ? new Date(range.from) : past ? null : new Date(now.getTime() - 2 * 3600_000);
    let to = range.to ? new Date(range.to) : past ? now : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      throw new BadRequestException("Ungueltiger Zeitraum.");
    }
    if (range.before && (!past || !range.to || !UUID.test(range.before))) throw new BadRequestException("Ungueltiger Zeitraum.");
    if (past && to! > now) to = now;
    const monthWindow = !past && !!from && !!to && to.getTime() - from.getTime() <= MONTH_WINDOW_MS;
    const limit = limitOverride ?? (monthWindow ? 300 : 100);
    let toCond: SQL | undefined;
    if (to && past) {
      // Seiten: (starts_at, id) < (to, before), sonst starts_at < to
      toCond = range.before
        ? sql`(${events.startsAt}, ${events.id}) < (${to.toISOString()}::timestamptz, ${range.before}::uuid)`
        : lt(events.startsAt, to);
    } else if (to) toCond = lte(events.startsAt, to);

    const rows = await this.db
      .select({
        e: events,
        orgSlug: organizations.slug,
        orgName: organizations.name,
        teamName: teams.name,
      })
      .from(events)
      .innerJoin(organizations, eq(organizations.id, events.orgId))
      .leftJoin(teams, eq(teams.id, events.teamId))
      .where(and(this.visibleWhere(v), extra, from ? gte(events.startsAt, from) : undefined, toCond))
      .orderBy(...(past ? [desc(events.startsAt), desc(events.id)] : [asc(events.startsAt), asc(events.id)]))
      .limit(limit);
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.e.id);
    const [counts, mine] = await Promise.all([
      this.db
        .select({ id: eventRsvps.eventId, status: eventRsvps.status, n: sql<number>`count(*)::int` })
        .from(eventRsvps)
        .where(inArray(eventRsvps.eventId, ids))
        .groupBy(eventRsvps.eventId, eventRsvps.status),
      this.db
        .select({ id: eventRsvps.eventId, status: eventRsvps.status })
        .from(eventRsvps)
        .where(and(inArray(eventRsvps.eventId, ids), eq(eventRsvps.userId, user.id))),
    ]);
    const mineBy = new Map(mine.map((m) => [m.id, m.status as RsvpState]));
    const positions = await this.waitlistPositions(
      user.id,
      mine.filter((m) => m.status === "waitlist").map((m) => m.id),
    );

    return rows.map(({ e, orgSlug, orgName, teamName }) => {
      const c = { yes: 0, maybe: 0, no: 0, waitlist: 0 };
      counts.filter((x) => x.id === e.id).forEach((x) => (c[x.status as RsvpState] = x.n));
      const role = v.roles.get(e.orgId);
      return {
        id: e.id,
        orgSlug,
        orgName,
        teamId: e.teamId,
        teamName,
        title: e.title,
        description: e.description,
        location: e.location,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt?.toISOString() ?? null,
        visibility: e.visibility as EventItem["visibility"],
        canceled: !!e.canceledAt,
        seriesId: e.seriesId,
        kind: e.kind as EventKind,
        capacity: e.capacity,
        counts: c,
        myStatus: mineBy.get(e.id) ?? null,
        waitlistPosition: positions.get(e.id) ?? null,
        canManage: !!role && STAFF.includes(role),
      };
    });
  }

  /** Eigener Platz auf der Warteliste je Termin (1 = als Naechstes). */
  private async waitlistPositions(userId: string, eventIds: string[]): Promise<Map<string, number>> {
    if (!eventIds.length) return new Map();
    const me = alias(eventRsvps, "me");
    const rows = await this.db
      .select({ id: eventRsvps.eventId, n: sql<number>`count(*)::int` })
      .from(eventRsvps)
      .innerJoin(me, and(eq(me.eventId, eventRsvps.eventId), eq(me.userId, userId)))
      .where(
        and(
          inArray(eventRsvps.eventId, eventIds),
          eq(eventRsvps.status, "waitlist"),
          sql`(${eventRsvps.waitlistedAt}, ${eventRsvps.userId}) <= (${me.waitlistedAt}, ${me.userId})`,
        ),
      )
      .groupBy(eventRsvps.eventId);
    return new Map(rows.map((r) => [r.id, r.n]));
  }
}
