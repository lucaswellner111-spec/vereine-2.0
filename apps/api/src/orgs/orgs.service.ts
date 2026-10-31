import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { CreateOrgInput, MemberItem, OrgDetail, OrgRole, OrgSummary, PublicUser } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { UsersDirectory } from "../auth/users-directory.service";
import { follows, orgMembers, organizations } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";

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
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
  ) {}

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
    const admins = await this.db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.role, "admin"), eq(orgMembers.status, "active")));
    await this.notifications.notify(
      admins.map((a) => a.userId),
      "membership_request",
      { orgSlug: org.slug, orgName: org.name },
    );
    return this.detail(slug, userId);
  }

  // --- Mitgliederverwaltung (nur Vorstand) -------------------------------------

  private async requireAdmin(orgId: string, userId: string) {
    if ((await this.activeRole(orgId, userId)) !== "admin") {
      throw new ForbiddenException("Nur der Vorstand darf Mitglieder verwalten.");
    }
  }

  private async adminCount(orgId: string): Promise<number> {
    const [{ n }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "admin"), eq(orgMembers.status, "active")));
    return n;
  }

  /** Datensparsam: nur Anzeigename, Rolle, Status. Stammdaten (Adresse etc.) folgen im Modul Verwaltung. */
  async members(slug: string, actor: PublicUser, status?: "pending" | "active"): Promise<MemberItem[]> {
    const org = await this.requireBySlug(slug);
    await this.requireAdmin(org.id, actor.id);
    const rows = await this.db
      .select({
        userId: orgMembers.userId,
        role: orgMembers.role,
        status: orgMembers.status,
        since: orgMembers.createdAt,
      })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, org.id), status ? eq(orgMembers.status, status) : undefined))
      .orderBy(orgMembers.createdAt)
      .limit(500);
    const names = await this.directory.names(rows.map((r) => r.userId));
    return rows.map((r) => ({
      ...r,
      name: names.get(r.userId) ?? "Gelöschter Nutzer",
      role: r.role as OrgRole,
      status: r.status as "pending" | "active",
      since: r.since.toISOString(),
    }));
  }

  async decide(slug: string, actor: PublicUser, targetId: string, decision: "approve" | "reject"): Promise<void> {
    const org = await this.requireBySlug(slug);
    await this.requireAdmin(org.id, actor.id);
    const key = and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, targetId));
    const [m] = await this.db.select().from(orgMembers).where(and(key, eq(orgMembers.status, "pending"))).limit(1);
    if (!m) throw new NotFoundException("Kein offener Antrag gefunden.");
    if (decision === "approve") await this.db.update(orgMembers).set({ status: "active" }).where(key);
    else await this.db.delete(orgMembers).where(key);
    await this.notifications.notify([targetId], "membership_decision", {
      orgSlug: org.slug,
      orgName: org.name,
      decision,
    });
  }

  async setRole(slug: string, actor: PublicUser, targetId: string, role: OrgRole): Promise<void> {
    const org = await this.requireBySlug(slug);
    await this.requireAdmin(org.id, actor.id);
    const current = await this.activeRole(org.id, targetId);
    if (!current) throw new NotFoundException("Aktives Mitglied nicht gefunden.");
    if (current === "admin" && role !== "admin" && (await this.adminCount(org.id)) <= 1) {
      throw new BadRequestException("Der Verein braucht mindestens einen Vorstand.");
    }
    await this.db
      .update(orgMembers)
      .set({ role })
      .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, targetId)));
  }

  /** Austritt (selbst) oder Entfernen (Vorstand). */
  async removeMember(slug: string, actor: PublicUser, targetId: string): Promise<void> {
    const org = await this.requireBySlug(slug);
    if (targetId !== actor.id) await this.requireAdmin(org.id, actor.id);
    const key = and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, targetId));
    const [m] = await this.db.select().from(orgMembers).where(key).limit(1);
    if (!m) throw new NotFoundException("Mitglied nicht gefunden.");
    if (m.role === "admin" && m.status === "active" && (await this.adminCount(org.id)) <= 1) {
      throw new BadRequestException("Der letzte Vorstand kann den Verein nicht verlassen.");
    }
    await this.db.delete(orgMembers).where(key);
  }

  // --- Kontakte (fuer den Chat) ---------------------------------------------------

  /**
   * Wer darf wem schreiben? (1) Beide sind aktive Mitglieder desselben Vereins oder
   * (2) der Empfaenger ist Vorstand/Moderation eines Vereins, dem der Absender folgt oder angehoert.
   * Verhindert unerwuenschte Nachrichten von Fremden.
   */
  async canContact(userId: string, otherId: string): Promise<boolean> {
    const [mine, theirs] = await Promise.all([
      this.db.select({ orgId: orgMembers.orgId }).from(orgMembers).where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, "active"))),
      this.db.select({ orgId: orgMembers.orgId, role: orgMembers.role }).from(orgMembers).where(and(eq(orgMembers.userId, otherId), eq(orgMembers.status, "active"))),
    ]);
    const myOrgs = new Set(mine.map((m) => m.orgId));
    if (theirs.some((t) => myOrgs.has(t.orgId))) return true;
    const staff = theirs.filter((t) => t.role === "admin" || t.role === "moderator").map((t) => t.orgId);
    if (staff.length === 0) return false;
    const [followed] = await this.db.select().from(follows).where(and(eq(follows.userId, userId), inArray(follows.orgId, staff))).limit(1);
    return !!followed;
  }

  /** Personen, die der Nutzer anschreiben darf (mit Vereinsnamen als Kontext). */
  async contactCandidates(userId: string): Promise<{ userId: string; context: string }[]> {
    const mine = await this.db.select({ orgId: orgMembers.orgId }).from(orgMembers).where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, "active")));
    const followed = await this.db.select({ orgId: follows.orgId }).from(follows).where(eq(follows.userId, userId));
    const myOrgIds = mine.map((m) => m.orgId);
    const followIds = followed.map((f) => f.orgId).filter((id) => !myOrgIds.includes(id));
    const out = new Map<string, string>();
    if (myOrgIds.length) {
      const rows = await this.db
        .select({ userId: orgMembers.userId, org: organizations.name })
        .from(orgMembers)
        .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
        .where(and(inArray(orgMembers.orgId, myOrgIds), eq(orgMembers.status, "active")))
        .limit(400);
      rows.filter((r) => r.userId !== userId).forEach((r) => out.set(r.userId, r.org));
    }
    if (followIds.length) {
      const rows = await this.db
        .select({ userId: orgMembers.userId, org: organizations.name })
        .from(orgMembers)
        .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
        .where(and(inArray(orgMembers.orgId, followIds), eq(orgMembers.status, "active"), inArray(orgMembers.role, ["admin", "moderator"])))
        .limit(200);
      rows.filter((r) => r.userId !== userId && !out.has(r.userId)).forEach((r) => out.set(r.userId, `${r.org} (Vorstand)`));
    }
    return [...out].map(([id, context]) => ({ userId: id, context }));
  }

  /** Aus den uebergebenen IDs nur die aktiven Mitglieder des Vereins. */
  async activeMemberIds(orgId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.status, "active"), inArray(orgMembers.userId, ids)));
    return rows.map((r) => r.userId);
  }

  async slugOf(orgId: string): Promise<string | null> {
    const [o] = await this.db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    return o?.slug ?? null;
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
