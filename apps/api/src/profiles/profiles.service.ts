import { ConflictException, Inject, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { FollowRequest, FollowState, PersonItem, ProfileView, PublicUser, UpdateProfileInput } from "@vereine/shared";
import { AuthService } from "../auth/auth.service";
import { UsersDirectory } from "../auth/users-directory.service";
import { DB, type Database } from "../db/db.module";
import { orgMembers, organizations, posts, profiles, userFollows } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { ProfileAccess, type ProfileRow } from "./profile-access.service";

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

@Injectable()
export class ProfilesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ProfileAccess) private readonly access: ProfileAccess,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async me(user: PublicUser): Promise<ProfileView> {
    const p = await this.access.ensure(user.id);
    if (!p) throw new NotFoundException("Profil nicht gefunden.");
    return this.view(user.id, p);
  }

  async get(viewer: PublicUser, handle: string): Promise<ProfileView> {
    const p = await this.access.byHandle(handle);
    if (!p) throw new NotFoundException("Profil nicht gefunden.");
    return this.view(viewer.id, p);
  }

  async update(user: PublicUser, input: UpdateProfileInput): Promise<ProfileView> {
    const current = await this.access.ensure(user.id);
    if (!current) throw new NotFoundException("Profil nicht gefunden.");
    if (input.displayName && input.displayName !== user.displayName) await this.auth.updateDisplayName(user.id, input.displayName);
    try {
      await this.db
        .update(profiles)
        .set({
          ...(input.handle ? { handle: input.handle } : {}),
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.visibility ? { visibility: input.visibility } : {}),
          ...(input.showClubs !== undefined ? { showClubs: input.showClubs } : {}),
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, user.id));
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException("Dieser Benutzername ist schon vergeben.");
      throw err;
    }
    // Wird ein Profil oeffentlich, werden offene Folgeanfragen automatisch angenommen.
    if (input.visibility === "public" && current.visibility === "private") {
      await this.db.update(userFollows).set({ status: "active" }).where(and(eq(userFollows.followedId, user.id), eq(userFollows.status, "pending")));
    }
    return this.me({ ...user, displayName: input.displayName ?? user.displayName });
  }

  // --- Folgen -----------------------------------------------------------------------

  async follow(viewer: PublicUser, handle: string): Promise<ProfileView> {
    const target = await this.access.byHandle(handle);
    if (!target) throw new NotFoundException("Profil nicht gefunden.");
    if (target.userId === viewer.id) throw new BadRequestException("Du kannst dir nicht selbst folgen.");
    const status = target.visibility === "private" ? "pending" : "active";
    const inserted = await this.db
      .insert(userFollows)
      .values({ followerId: viewer.id, followedId: target.userId, status })
      .onConflictDoNothing()
      .returning();
    if (inserted.length) {
      const mine = await this.access.ensure(viewer.id);
      await this.notifications.notify([target.userId], status === "pending" ? "follow_request" : "new_follower", {
        handle: mine?.handle ?? "",
        name: viewer.displayName,
      });
    }
    return this.view(viewer.id, target);
  }

  async unfollow(viewer: PublicUser, handle: string): Promise<ProfileView> {
    const target = await this.access.byHandle(handle);
    if (!target) throw new NotFoundException("Profil nicht gefunden.");
    await this.db.delete(userFollows).where(and(eq(userFollows.followerId, viewer.id), eq(userFollows.followedId, target.userId)));
    return this.view(viewer.id, target);
  }

  async requests(user: PublicUser): Promise<FollowRequest[]> {
    const rows = await this.db
      .select({ id: userFollows.followerId, at: userFollows.createdAt })
      .from(userFollows)
      .where(and(eq(userFollows.followedId, user.id), eq(userFollows.status, "pending")))
      .orderBy(desc(userFollows.createdAt))
      .limit(100);
    const profs = await this.access.ensureMany(rows.map((r) => r.id));
    const names = await this.directory.names(rows.map((r) => r.id));
    return rows.map((r) => ({
      userId: r.id,
      handle: profs.get(r.id)?.handle ?? "",
      displayName: names.get(r.id) ?? "Gelöschter Nutzer",
      avatarId: profs.get(r.id)?.avatarMediaId ?? null,
      at: r.at.toISOString(),
    }));
  }

  async decide(user: PublicUser, followerId: string, decision: "approve" | "reject"): Promise<void> {
    const key = and(eq(userFollows.followedId, user.id), eq(userFollows.followerId, followerId), eq(userFollows.status, "pending"));
    const [row] = await this.db.select().from(userFollows).where(key).limit(1);
    if (!row) throw new NotFoundException("Keine offene Anfrage.");
    if (decision === "approve") {
      await this.db.update(userFollows).set({ status: "active" }).where(key);
      const mine = await this.access.ensure(user.id);
      await this.notifications.notify([followerId], "follow_accepted", { handle: mine?.handle ?? "", name: user.displayName });
    } else {
      await this.db.delete(userFollows).where(key);
    }
  }

  /** Follower- bzw. Folge-Liste; nur sichtbar, wenn auch das Profil sichtbar ist. */
  async list(viewer: PublicUser, handle: string, which: "followers" | "following", offset = 0): Promise<PersonItem[]> {
    const p = await this.access.byHandle(handle);
    if (!p) throw new NotFoundException("Profil nicht gefunden.");
    if (!(await this.access.canView(viewer.id, p.userId))) return [];
    const col = which === "followers" ? userFollows.followerId : userFollows.followedId;
    const anchor = which === "followers" ? userFollows.followedId : userFollows.followerId;
    const rows = await this.db
      .select({ id: col })
      .from(userFollows)
      .where(and(eq(anchor, p.userId), eq(userFollows.status, "active")))
      .orderBy(desc(userFollows.createdAt))
      .limit(50)
      .offset(Math.max(0, offset));
    return this.people(viewer.id, rows.map((r) => r.id));
  }

  async search(viewer: PublicUser, q: string): Promise<PersonItem[]> {
    const term = q.trim().replace(/^@/, "");
    if (term.length < 2) return [];
    const byHandle = await this.db.select({ id: profiles.userId }).from(profiles).where(ilike(profiles.handle, `${term}%`)).limit(20);
    const byName = await this.directory.search(term, 20);
    const ids = [...new Set([...byHandle.map((r) => r.id), ...byName])].filter((id) => id !== viewer.id).slice(0, 20);
    return this.people(viewer.id, ids);
  }

  // --- intern -----------------------------------------------------------------------------

  private async people(viewerId: string, ids: string[]): Promise<PersonItem[]> {
    if (ids.length === 0) return [];
    const [profs, names, states] = await Promise.all([
      this.access.ensureMany(ids),
      this.directory.names(ids),
      this.followStates(viewerId, ids),
    ]);
    return ids
      .filter((id) => profs.has(id))
      .map((id) => ({
        userId: id,
        handle: profs.get(id)!.handle,
        displayName: names.get(id) ?? "Gelöschter Nutzer",
        avatarId: profs.get(id)!.avatarMediaId,
        follow: states.get(id) ?? "none",
      }));
  }

  private async followStates(viewerId: string, ids: string[]): Promise<Map<string, FollowState>> {
    const rows = await this.db
      .select({ id: userFollows.followedId, status: userFollows.status })
      .from(userFollows)
      .where(and(eq(userFollows.followerId, viewerId), or(...ids.map((id) => eq(userFollows.followedId, id)))!));
    return new Map(rows.map((r) => [r.id, r.status === "active" ? "following" : "requested"]));
  }

  private async view(viewerId: string, p: ProfileRow): Promise<ProfileView> {
    const isMe = viewerId === p.userId;
    const [names, followState, [postCount], [followers], [following], clubs] = await Promise.all([
      this.directory.names([p.userId]),
      isMe ? Promise.resolve(new Map<string, FollowState>()) : this.followStates(viewerId, [p.userId]),
      this.db.select({ n: sql<number>`count(*)::int` }).from(posts).where(and(eq(posts.authorId, p.userId), isNull(posts.orgId), isNull(posts.deletedAt), isNull(posts.hiddenAt))),
      this.db.select({ n: sql<number>`count(*)::int` }).from(userFollows).where(and(eq(userFollows.followedId, p.userId), eq(userFollows.status, "active"))),
      this.db.select({ n: sql<number>`count(*)::int` }).from(userFollows).where(and(eq(userFollows.followerId, p.userId), eq(userFollows.status, "active"))),
      p.showClubs
        ? this.db
            .select({ slug: organizations.slug, name: organizations.name })
            .from(orgMembers)
            .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
            .where(and(eq(orgMembers.userId, p.userId), eq(orgMembers.status, "active")))
            .limit(20)
        : Promise.resolve(null),
    ]);
    const follow = followState.get(p.userId) ?? "none";
    const canView = isMe || p.visibility === "public" || follow === "following";
    return {
      userId: p.userId,
      handle: p.handle,
      displayName: names.get(p.userId) ?? "Gelöschter Nutzer",
      bio: p.bio,
      location: p.location,
      avatarId: p.avatarMediaId,
      visibility: p.visibility as ProfileView["visibility"],
      showClubs: p.showClubs,
      counts: { posts: postCount.n, followers: followers.n, following: following.n },
      clubs: canView ? clubs : null, // bei privaten Profilen auch Vereinszugehoerigkeit nicht sichtbar
      viewer: { isMe, follow, canView },
    };
  }
}
