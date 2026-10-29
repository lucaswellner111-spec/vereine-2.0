import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { CreateOrgInput, OrgDetail, OrgRole, OrgSummary, PublicUser } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { follows, orgMembers, organizations } from "../db/schema";

type OrgRow = typeof organizations.$inferSelect;

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "verein";

@Injectable()
export class OrgsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(user: PublicUser, input: CreateOrgInput): Promise<OrgDetail> {
    const base = slugify(input.name);
    let slug = base;
    for (let i = 2; await this.findBySlug(slug); i++) slug = `${base}-${i}`;

    const org = await this.db.transaction(async (tx) => {
      const [created] = await tx.insert(organizations).values({ ...input, slug }).returning();
      await tx.insert(orgMembers).values({ orgId: created.id, userId: user.id, role: "admin", status: "active" });
      await tx.insert(follows).values({ orgId: created.id, userId: user.id });
      return created;
    });
    return this.detail(org.slug, user.id);
  }

  async list(userId: string, q?: string): Promise<OrgSummary[]> {
    const term = q?.trim();
    const rows = await this.db
      .select()
      .from(organizations)
      .where(
        term
          ? or(ilike(organizations.name, `%${term}%`), ilike(organizations.city, `%${term}%`), ilike(organizations.category, `%${term}%`))
          : undefined,
      )
      .orderBy(organizations.name)
      .limit(100);
    void userId;
    return this.summaries(rows);
  }

  /** Vereine, fuer die der Nutzer Beitraege veroeffentlichen darf (Vorstand/Moderation). */
  async publishable(userId: string): Promise<OrgSummary[]> {
    const rows = await this.db
      .select({ org: organizations })
      .from(orgMembers)
      .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
      .where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, "active"), inArray(orgMembers.role, ["admin", "moderator"])))
      .orderBy(organizations.name);
    return this.summaries(rows.map((r) => r.org));
  }

  async detail(slug: string, userId: string): Promise<OrgDetail> {
    const org = await this.requireBySlug(slug);
    const [summary] = await this.summaries([org]);
    const [membership] = await this.db
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, userId)))
      .limit(1);
    const [follow] = await this.db
      .select()
      .from(follows)
      .where(and(eq(follows.orgId, org.id), eq(follows.userId, userId)))
      .limit(1);
    return {
      ...summary,
      viewer: {
        following: !!follow,
        membership: !membership ? "none" : membership.status === "active" ? "active" : "pending",
        role: membership?.status === "active" ? (membership.role as OrgRole) : null,
      },
    };
  }

  async follow(slug: string, userId: string, on: boolean): Promise<OrgDetail> {
    const org = await this.requireBySlug(slug);
    if (on) await this.db.insert(follows).values({ orgId: org.id, userId }).onConflictDoNothing();
    else await this.db.delete(follows).where(and(eq(follows.orgId, org.id), eq(follows.userId, userId)));
    return this.detail(slug, userId);
  }

  /** Mitgliedschaftsantrag; die Freigabe durch den Vorstand folgt im Modul "Verwaltung". */
  async requestMembership(slug: string, userId: string): Promise<OrgDetail> {
    const org = await this.requireBySlug(slug);
    const inserted = await this.db
      .insert(orgMembers)
      .values({ orgId: org.id, userId, role: "member", status: "pending" })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) throw new ConflictException("Du bist bereits Mitglied oder hast schon einen Antrag gestellt.");
    return this.detail(slug, userId);
  }

  async findBySlug(slug: string): Promise<OrgRow | undefined> {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    return org;
  }

  async requireBySlug(slug: string): Promise<OrgRow> {
    const org = await this.findBySlug(slug);
    if (!org) throw new NotFoundException("Verein nicht gefunden.");
    return org;
  }

  /** Aktive Rolle des Nutzers im Verein (null = kein aktives Mitglied). */
  async activeRole(orgId: string, userId: string): Promise<OrgRole | null> {
    const [m] = await this.db
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId), eq(orgMembers.status, "active")))
      .limit(1);
    return (m?.role as OrgRole) ?? null;
  }

  private async summaries(rows: OrgRow[]): Promise<OrgSummary[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [followerCounts, memberCounts] = await Promise.all([
      this.db
        .select({ orgId: follows.orgId, n: sql<number>`count(*)::int` })
        .from(follows)
        .where(inArray(follows.orgId, ids))
        .groupBy(follows.orgId),
      this.db
        .select({ orgId: orgMembers.orgId, n: sql<number>`count(*)::int` })
        .from(orgMembers)
        .where(and(inArray(orgMembers.orgId, ids), eq(orgMembers.status, "active")))
        .groupBy(orgMembers.orgId),
    ]);
    const f = new Map(followerCounts.map((r) => [r.orgId, r.n]));
    const m = new Map(memberCounts.map((r) => [r.orgId, r.n]));
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      category: r.category,
      city: r.city,
      about: r.about,
      followers: f.get(r.id) ?? 0,
      members: m.get(r.id) ?? 0,
    }));
  }
}
