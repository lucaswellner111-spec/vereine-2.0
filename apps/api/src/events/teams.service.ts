import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { PublicUser, TeamItem, TeamMemberItem } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { teamMembers, teams, users } from "../db/schema";
import { OrgsService } from "../orgs/orgs.service";

@Injectable()
export class TeamsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OrgsService) private readonly orgs: OrgsService,
  ) {}

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
      const e = err as { code?: string; cause?: { code?: string } };
      if (e.code === "23505" || e.cause?.code === "23505") throw new ConflictException("Ein Team mit diesem Namen gibt es schon.");
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
    return this.db
      .select({ userId: users.id, name: users.displayName })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(users.displayName);
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
