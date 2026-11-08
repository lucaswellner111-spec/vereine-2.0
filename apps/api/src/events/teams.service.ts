import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { and, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { PublicUser, TeamItem, TeamMemberItem } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { UsersDirectory } from "../auth/users-directory.service";
import { eventAttendance, eventRsvps, eventShiftSignups, eventShifts, events, teamMembers, teams } from "../db/schema";
import { isUniqueViolation } from "../common/pg-errors";
import { OrgEvents } from "../orgs/org-events";
import { OrgsService } from "../orgs/orgs.service";
import { EventsService } from "./events.service";

@Injectable()
export class TeamsService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
    @Inject(OrgEvents) private readonly orgEvents: OrgEvents,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  onModuleInit() {
    this.orgEvents.onLeave("teams", (orgId, userId) => this.leaveOrg(orgId, userId));
  }

  /**
   * Austritt: Team-Mitgliedschaften im Verein und Zusagen zu kuenftigen internen Terminen (nur Mitglieder bzw. Team)
   * entfernen, ebenso Helfer-Eintraege kuenftiger Termine und alle Anwesenheitseintraege des Vereins. Zusagen zu
   * oeffentlichen Terminen und vergangene Termine bleiben unveraendert. Frei gewordene Plaetze ruecken nach.
   */
  async leaveOrg(orgId: string, userId: string): Promise<void> {
    const freed = await this.db.transaction(async (tx) => {
      const now = new Date();
      // Betroffene Termine in fester Reihenfolge sperren (der Zaehler-Trigger aktualisiert sie), sonst drohen Deadlocks
      await tx
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.orgId, orgId), inArray(events.id, tx.select({ id: eventRsvps.eventId }).from(eventRsvps).where(eq(eventRsvps.userId, userId)))))
        .orderBy(events.id)
        .for("update");
      const orgTeams = tx.select({ id: teams.id }).from(teams).where(eq(teams.orgId, orgId));
      await tx.delete(teamMembers).where(and(eq(teamMembers.userId, userId), inArray(teamMembers.teamId, orgTeams)));
      const internal = tx
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.orgId, orgId), gt(events.startsAt, now), or(eq(events.visibility, "members"), isNotNull(events.teamId))));
      const removed = await tx
        .delete(eventRsvps)
        .where(and(eq(eventRsvps.userId, userId), inArray(eventRsvps.eventId, internal)))
        .returning({ eventId: eventRsvps.eventId, status: eventRsvps.status });
      const futureShifts = tx
        .select({ id: eventShifts.id })
        .from(eventShifts)
        .innerJoin(events, eq(events.id, eventShifts.eventId))
        .where(and(eq(events.orgId, orgId), gt(events.startsAt, now)));
      await tx.delete(eventShiftSignups).where(and(eq(eventShiftSignups.userId, userId), inArray(eventShiftSignups.shiftId, futureShifts)));
      const orgEventIds = tx.select({ id: events.id }).from(events).where(eq(events.orgId, orgId));
      await tx.delete(eventAttendance).where(and(eq(eventAttendance.userId, userId), inArray(eventAttendance.eventId, orgEventIds)));
      return removed.filter((r) => r.status === "yes").map((r) => r.eventId);
    });
    await this.events.fillWaitlistsFor(freed);
  }

  private async requireAdmin(orgId: string, userId: string) {
    if ((await this.orgs.activeRole(orgId, userId)) !== "admin") throw new ForbiddenException("Nur der Vorstand verwaltet Teams.");
  }

  private async requireTeam(orgId: string, teamId: string) {
    const [team] = await this.db.select().from(teams).where(and(eq(teams.id, teamId), eq(teams.orgId, orgId))).limit(1);
    if (!team) throw new NotFoundException("Team nicht gefunden.");
    return team;
  }

  async create(user: PublicUser, slug: string, input: { name: string; description: string }): Promise<TeamItem> {
    const org = await this.orgs.requireBySlug(slug);
    await this.requireAdmin(org.id, user.id);
    try {
      const [t] = await this.db.insert(teams).values({ orgId: org.id, ...input }).returning();
      return { id: t.id, name: t.name, description: t.description, members: 0, isMember: false };
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException("Ein Team mit diesem Namen gibt es schon.");
      throw err;
    }
  }

  /** Aktive Vereinsmitglieder sehen alle Teams des Vereins. */
  async list(user: PublicUser, slug: string): Promise<TeamItem[]> {
    const org = await this.orgs.requireBySlug(slug);
    if (!(await this.orgs.activeRole(org.id, user.id))) throw new ForbiddenException("Nur fuer Vereinsmitglieder.");
    const rows = await this.db
      .select({
        id: teams.id,
        name: teams.name,
        description: teams.description,
        members: sql<number>`count(${teamMembers.userId})::int`,
        isMember: sql<boolean>`coalesce(bool_or(${teamMembers.userId} = ${user.id}), false)`,
      })
      .from(teams)
      .leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
      .where(eq(teams.orgId, org.id))
      .groupBy(teams.id)
      .orderBy(teams.name);
    return rows;
  }

  async members(user: PublicUser, slug: string, teamId: string): Promise<TeamMemberItem[]> {
    const org = await this.orgs.requireBySlug(slug);
    await this.requireAdmin(org.id, user.id);
    await this.requireTeam(org.id, teamId);
    const rows = await this.db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId)).limit(2000);
    const names = await this.directory.names(rows.map((r) => r.userId));
    return rows
      .map((r) => ({ userId: r.userId, name: names.get(r.userId) ?? "Gelöschter Nutzer" }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  async addMember(user: PublicUser, slug: string, teamId: string, targetId: string): Promise<void> {
    const org = await this.orgs.requireBySlug(slug);
    await this.requireAdmin(org.id, user.id);
    await this.requireTeam(org.id, teamId);
    if (!(await this.orgs.activeRole(org.id, targetId))) throw new NotFoundException("Nur aktive Vereinsmitglieder koennen ins Team.");
    await this.db.insert(teamMembers).values({ teamId, userId: targetId }).onConflictDoNothing();
  }

  /** Entfernen durch den Vorstand oder Austritt durch das Mitglied selbst. */
  async removeMember(user: PublicUser, slug: string, teamId: string, targetId: string): Promise<void> {
    const org = await this.orgs.requireBySlug(slug);
    if (targetId !== user.id) await this.requireAdmin(org.id, user.id);
    await this.requireTeam(org.id, teamId);
    await this.db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetId)));
  }

  async remove(user: PublicUser, slug: string, teamId: string): Promise<void> {
    const org = await this.orgs.requireBySlug(slug);
    await this.requireAdmin(org.id, user.id);
    await this.requireTeam(org.id, teamId);
    await this.db.delete(teams).where(eq(teams.id, teamId));
  }
}
