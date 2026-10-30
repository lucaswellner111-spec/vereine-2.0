import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { and, asc, eq, gt, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { CreateEventInput, EventItem, OrgRole, PublicUser, RsvpItem, RsvpStatus } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { eventRsvps, events, follows, orgMembers, organizations, teamMembers, teams, users } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { OrgsService } from "../orgs/orgs.service";
import { buildIcs } from "./ics";

const STAFF: OrgRole[] = ["admin", "moderator"];
const REMINDER_LEAD_MS = 24 * 3600_000;
const REMINDER_INTERVAL_MS = 10 * 60_000;

type Viewer = { roles: Map<string, OrgRole>; follows: Set<string>; teams: Set<string> };

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    // Der atomare Claim in sendDueReminders() macht den Lauf auf mehreren Servern gefahrlos.
    this.timer = setInterval(() => void this.sendDueReminders().catch(() => undefined), REMINDER_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  // --- Lesen ------------------------------------------------------------------

  /**
   * Kalender des Nutzers. Sichtbar sind: oeffentliche Termine gefolgter/eigener Vereine, interne
   * Vereinstermine (Mitglieder), Team-Termine (Teammitglieder) und alle Termine fuer Vorstand/Moderation.
   * SKALIERUNG: Index events(org_id, starts_at); begrenzt auf 100 Termine je Abfrage + Zeitfenster.
   */
  async listMine(user: PublicUser, range: { from?: string; to?: string }): Promise<EventItem[]> {
    return this.query(user, undefined, range);
  }

  async listForOrg(user: PublicUser, slug: string, range: { from?: string; to?: string }): Promise<EventItem[]> {
    const org = await this.orgs.requireBySlug(slug);
    return this.query(user, eq(events.orgId, org.id), range);
  }

  async get(user: PublicUser, id: string): Promise<EventItem> {
    const [item] = await this.query(user, eq(events.id, id), { from: "1970-01-01T00:00:00Z" });
    if (!item) throw new NotFoundException("Termin nicht gefunden.");
    return item;
  }

  async participants(user: PublicUser, id: string): Promise<RsvpItem[]> {
    const event = await this.get(user, id);
    if (!event.canManage) throw new ForbiddenException("Nur Vorstand und Moderation sehen die Teilnehmerliste.");
    const rows = await this.db
      .select({ userId: users.id, name: users.displayName, status: eventRsvps.status })
      .from(eventRsvps)
      .innerJoin(users, eq(users.id, eventRsvps.userId))
      .where(eq(eventRsvps.eventId, id))
      .orderBy(users.displayName);
    return rows.map((r) => ({ ...r, status: r.status as RsvpStatus }));
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

    const [row] = await this.db
      .insert(events)
      .values({
        orgId: org.id,
        teamId: input.teamId ?? null,
        title: input.title,
        description: input.description,
        location: input.location,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        visibility: input.visibility,
        createdBy: user.id,
      })
      .returning();

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
      { eventId: row.id, title: row.title, orgSlug: org.slug, orgName: org.name, startsAt: row.startsAt.toISOString() },
    );
    return this.get(user, row.id);
  }

  async cancel(user: PublicUser, id: string): Promise<void> {
    const event = await this.get(user, id);
    if (!event.canManage) throw new ForbiddenException("Nur Vorstand und Moderation duerfen Termine absagen.");
    if (event.canceled) return;
    await this.db.update(events).set({ canceledAt: new Date() }).where(eq(events.id, id));
    const attendees = await this.db
      .select({ userId: eventRsvps.userId })
      .from(eventRsvps)
      .where(and(eq(eventRsvps.eventId, id), inArray(eventRsvps.status, ["yes", "maybe"])));
    await this.notifications.notify(
      attendees.map((a) => a.userId).filter((u) => u !== user.id),
      "event_canceled",
      { eventId: id, title: event.title, orgSlug: event.orgSlug, orgName: event.orgName, startsAt: event.startsAt },
    );
  }

  async rsvp(user: PublicUser, id: string, status: RsvpStatus): Promise<EventItem> {
    const event = await this.get(user, id);
    if (event.canceled) throw new BadRequestException("Der Termin wurde abgesagt.");
    const end = event.endsAt ? new Date(event.endsAt) : new Date(new Date(event.startsAt).getTime() + 3 * 3600_000);
    if (end < new Date()) throw new BadRequestException("Der Termin liegt in der Vergangenheit.");
    await this.db
      .insert(eventRsvps)
      .values({ eventId: id, userId: user.id, status })
      .onConflictDoUpdate({ target: [eventRsvps.eventId, eventRsvps.userId], set: { status, updatedAt: new Date() } });
    return this.get(user, id);
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

  private async query(user: PublicUser, extra: SQL | undefined, range: { from?: string; to?: string }): Promise<EventItem[]> {
    const v = await this.viewer(user.id);
    const from = range.from ? new Date(range.from) : new Date(Date.now() - 2 * 3600_000);
    if (Number.isNaN(from.getTime()) || (range.to && Number.isNaN(new Date(range.to).getTime()))) {
      throw new BadRequestException("Ungueltiger Zeitraum.");
    }
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
      .where(
        and(
          this.visibleWhere(v),
          extra,
          gte(events.startsAt, from),
          range.to ? lte(events.startsAt, new Date(range.to)) : undefined,
        ),
      )
      .orderBy(asc(events.startsAt), asc(events.id))
      .limit(100);
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
    const mineBy = new Map(mine.map((m) => [m.id, m.status as RsvpStatus]));

    return rows.map(({ e, orgSlug, orgName, teamName }) => {
      const c = { yes: 0, maybe: 0, no: 0 };
      counts.filter((x) => x.id === e.id).forEach((x) => (c[x.status as RsvpStatus] = x.n));
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
        counts: c,
        myStatus: mineBy.get(e.id) ?? null,
        canManage: !!role && STAFF.includes(role),
      };
    });
  }
}
