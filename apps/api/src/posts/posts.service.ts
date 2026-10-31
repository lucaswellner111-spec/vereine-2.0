import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gt, inArray, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import type {
  CommentItem,
  CreatePostInput,
  FeedPost,
  FeedResponse,
  PublicUser,
  ReportInput,
} from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { UsersDirectory } from "../auth/users-directory.service";
import { comments, follows, orgMembers, organizations, postLikes, posts, reports } from "../db/schema";
import { reasonFor, scorePost, type Relation } from "../feed/ranking";
import { NotificationsService } from "../notifications/notifications.service";
import { OrgsService } from "../orgs/orgs.service";

export const MODERATION_ROLES = ["admin", "moderator"];
const PAGE = 20;
/**
 * SKALIERUNG (Feed): Fan-out-on-read mit Index-Zugriff. Chrono-Feed nutzt Keyset-Paging ueber
 * posts(org_id, created_at). Das Ranking bewertet nur ein begrenztes Fenster (RANK_WINDOW,
 * 14 Tage) pro Anfrage. Ab ~100k aktiven Nutzern: Ranking-Fenster pro Nutzer in Redis cachen
 * (60 s) bzw. Feeds vorberechnen (Fan-out-on-write) und Zaehler denormalisieren.
 */
const RANK_WINDOW = 150;
const RANK_DAYS = 14;

type Cursor = { ts: string; id: string };
const encode = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
function decode(raw?: string): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString());
    if (typeof c.ts === "string" && typeof c.id === "string") return c;
  } catch {
    /* fall through */
  }
  throw new BadRequestException("Ungueltiger Cursor.");
}

@Injectable()
export class PostsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
  ) {}

  async create(user: PublicUser, input: CreatePostInput): Promise<FeedPost> {
    let orgId: string | null = null;
    if (input.orgSlug) {
      const org = await this.orgs.requireBySlug(input.orgSlug);
      const role = await this.orgs.activeRole(org.id, user.id);
      if (!role || !MODERATION_ROLES.includes(role)) {
        throw new ForbiddenException("Nur Vorstand und Moderation duerfen fuer den Verein posten.");
      }
      orgId = org.id;
    }
    const [row] = await this.db
      .insert(posts)
      .values({ authorId: user.id, orgId, body: input.body, kind: input.kind })
      .returning();
    const [post] = await this.hydrate([row.id], user.id, new Map());
    return post;
  }

  async feed(user: PublicUser, requested: "ranked" | "chrono", cursor?: string): Promise<FeedResponse> {
    const personalized = requested === "ranked" && (await this.hasConsent(user.id));
    const relations = await this.relations(user.id);
    const orgIds = [...relations.keys()];
    const relevant = and(
      isNull(posts.deletedAt),
      isNull(posts.hiddenAt),
      or(eq(posts.authorId, user.id), orgIds.length ? inArray(posts.orgId, orgIds) : undefined),
    );

    if (!personalized) {
      const page = await this.chronoPage(relevant, decode(cursor));
      let ids = page.ids;
      if (!cursor && ids.length < PAGE) ids = [...ids, ...(await this.discover(user.id, orgIds, PAGE - ids.length))];
      const feedPosts = await this.hydrate(ids, user.id, relations);
      return { mode: "chrono", personalized: false, posts: feedPosts, nextCursor: page.nextCursor };
    }

    // Personalisiert: begrenztes Fenster relevanter Beitraege bewerten (siehe SKALIERUNG oben).
    const offset = cursor?.startsWith("r:") ? Math.max(0, Number(cursor.slice(2)) || 0) : 0;
    const since = new Date(Date.now() - RANK_DAYS * 864e5);
    const window = await this.db
      .select({ id: posts.id })
      .from(posts)
      .where(and(relevant, gt(posts.createdAt, since)))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(RANK_WINDOW);
    let ids = window.map((r) => r.id);
    if (offset === 0 && ids.length < PAGE) ids = [...ids, ...(await this.discover(user.id, orgIds, PAGE - ids.length))];

    const hydrated = await this.hydrateWithRelation(ids, user.id, relations);
    const now = Date.now();
    const ranked = hydrated
      .map(({ post: p, relation }) => ({
        p,
        score: scorePost({
          likes: p.likes,
          comments: p.comments,
          ageHours: (now - new Date(p.createdAt).getTime()) / 36e5,
          relation,
        }),
      }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);
    const slice = ranked.slice(offset, offset + PAGE);
    return {
      mode: "ranked",
      personalized: true,
      posts: slice,
      nextCursor: offset + PAGE < ranked.length ? `r:${offset + PAGE}` : null,
    };
  }

  async orgFeed(user: PublicUser, slug: string, cursor?: string): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
    const org = await this.orgs.requireBySlug(slug);
    const page = await this.chronoPage(
      and(eq(posts.orgId, org.id), isNull(posts.deletedAt), isNull(posts.hiddenAt)),
      decode(cursor),
    );
    return { posts: await this.hydrate(page.ids, user.id, await this.relations(user.id)), nextCursor: page.nextCursor };
  }

  async toggleLike(user: PublicUser, postId: string): Promise<{ liked: boolean; likes: number }> {
    await this.requirePost(postId);
    const removed = await this.db
      .delete(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, user.id)))
      .returning();
    if (removed.length === 0) await this.db.insert(postLikes).values({ postId, userId: user.id });
    const [{ n }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(postLikes)
      .where(eq(postLikes.postId, postId));
    return { liked: removed.length === 0, likes: n };
  }

  async listComments(postId: string): Promise<CommentItem[]> {
    await this.requirePost(postId);
    const rows = await this.db
      .select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, authorId: comments.authorId })
      .from(comments)
      .where(eq(comments.postId, postId))
      .orderBy(comments.createdAt)
      .limit(200);
    const names = await this.directory.names(rows.map((r) => r.authorId));
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      author: { id: r.authorId, name: names.get(r.authorId) ?? "Gelöschter Nutzer" },
    }));
  }

  async addComment(user: PublicUser, postId: string, body: string): Promise<CommentItem> {
    const post = await this.requirePost(postId);
    const [row] = await this.db.insert(comments).values({ postId, authorId: user.id, body }).returning();
    if (post.authorId !== user.id) {
      await this.notifications.notify([post.authorId], "comment", {
        postId,
        commenter: user.displayName,
        excerpt: body.slice(0, 80),
      });
    }
    return { id: row.id, body: row.body, createdAt: row.createdAt.toISOString(), author: { id: user.id, name: user.displayName } };
  }

  async report(user: PublicUser, postId: string, input: ReportInput): Promise<void> {
    const post = await this.requirePost(postId);
    await this.db
      .insert(reports)
      .values({ postId, orgId: post.orgId, reporterId: user.id, reason: input.reason, note: input.note });
  }

  async remove(user: PublicUser, postId: string): Promise<void> {
    const post = await this.requirePost(postId);
    const role = post.orgId ? await this.orgs.activeRole(post.orgId, user.id) : null;
    if (post.authorId !== user.id && !(role && MODERATION_ROLES.includes(role))) {
      throw new ForbiddenException("Du darfst diesen Beitrag nicht loeschen.");
    }
    await this.db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, postId));
  }

  // --- intern ---------------------------------------------------------------

  private async requirePost(id: string) {
    const [post] = await this.db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), isNull(posts.deletedAt), isNull(posts.hiddenAt)))
      .limit(1);
    if (!post) throw new NotFoundException("Beitrag nicht gefunden.");
    return post;
  }

  /** Keyset-Paging (created_at, id) absteigend; Zeitstempel bleibt als Text mikrosekundengenau. */
  private async chronoPage(where: SQL | undefined, after: Cursor | null) {
    const rows = await this.db
      .select({ id: posts.id, ts: sql<string>`${posts.createdAt}::text` })
      .from(posts)
      .where(
        and(
          where,
          after ? sql`(${posts.createdAt}, ${posts.id}) < (${after.ts}::timestamptz, ${after.id}::uuid)` : undefined,
        ),
      )
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(PAGE + 1);
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return {
      ids: page.map((r) => r.id),
      nextCursor: rows.length > PAGE && last ? encode({ ts: last.ts, id: last.id }) : null,
    };
  }

  /** Oeffentliche Vereinsbeitraege, die der Nutzer noch nicht ueber Follow/Mitgliedschaft sieht. */
  private async discover(userId: string, orgIds: string[], limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          isNull(posts.deletedAt),
          isNull(posts.hiddenAt),
          ne(posts.authorId, userId),
          sql`${posts.orgId} is not null`,
          orgIds.length ? notInArray(posts.orgId, orgIds) : undefined,
        ),
      )
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  /** Beziehung des Nutzers zu Vereinen: Mitglied (aktiv) vor Follower. */
  private async relations(userId: string): Promise<Map<string, Relation>> {
    const [followed, member] = await Promise.all([
      this.db.select({ orgId: follows.orgId }).from(follows).where(eq(follows.userId, userId)),
      this.db
        .select({ orgId: orgMembers.orgId })
        .from(orgMembers)
        .where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, "active"))),
    ]);
    const map = new Map<string, Relation>();
    followed.forEach((f) => map.set(f.orgId, "follow"));
    member.forEach((m) => map.set(m.orgId, "member"));
    return map;
  }

  private hasConsent(userId: string): Promise<boolean> {
    return this.directory.hasConsent(userId, "personalized_feed");
  }

  /** Reichert Beitrags-IDs mit Autor, Verein, Zaehlern und Nutzer-Status an (Reihenfolge der ids bleibt). */
  private async hydrate(ids: string[], userId: string, relations: Map<string, Relation>): Promise<FeedPost[]> {
    return (await this.hydrateWithRelation(ids, userId, relations)).map((x) => x.post);
  }

  private async hydrateWithRelation(
    ids: string[],
    userId: string,
    relations: Map<string, Relation>,
  ): Promise<{ post: FeedPost; relation: Relation }[]> {
    if (ids.length === 0) return [];
    const [rows, likeCounts, commentCounts, mine] = await Promise.all([
      this.db
        .select({
          id: posts.id, body: posts.body, kind: posts.kind, createdAt: posts.createdAt,
          authorId: posts.authorId,
          orgId: organizations.id, orgSlug: organizations.slug, orgName: organizations.name,
        })
        .from(posts)
        .leftJoin(organizations, eq(organizations.id, posts.orgId))
        .where(inArray(posts.id, ids)),
      this.db
        .select({ id: postLikes.postId, n: sql<number>`count(*)::int` })
        .from(postLikes).where(inArray(postLikes.postId, ids)).groupBy(postLikes.postId),
      this.db
        .select({ id: comments.postId, n: sql<number>`count(*)::int` })
        .from(comments).where(inArray(comments.postId, ids)).groupBy(comments.postId),
      this.db
        .select({ id: postLikes.postId })
        .from(postLikes).where(and(inArray(postLikes.postId, ids), eq(postLikes.userId, userId))),
    ]);
    const likes = new Map(likeCounts.map((r) => [r.id, r.n]));
    const cmts = new Map(commentCounts.map((r) => [r.id, r.n]));
    const liked = new Set(mine.map((r) => r.id));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const names = await this.directory.names(rows.map((r) => r.authorId));

    const roleCache = new Map<string, Promise<string | null>>();
    const canModerate = async (orgId: string | null) => {
      if (!orgId) return false;
      if (!roleCache.has(orgId)) roleCache.set(orgId, this.orgs.activeRole(orgId, userId));
      const role = await roleCache.get(orgId)!;
      return !!role && MODERATION_ROLES.includes(role);
    };

    return Promise.all(
      ids
        .filter((id) => byId.has(id))
        .map(async (id) => {
          const r = byId.get(id)!;
          const l = likes.get(id) ?? 0;
          const c = cmts.get(id) ?? 0;
          const relation: Relation = r.authorId === userId ? "own" : r.orgId ? relations.get(r.orgId) ?? "discover" : "discover";
          const post: FeedPost = {
            id: r.id,
            body: r.body,
            kind: r.kind as FeedPost["kind"],
            createdAt: r.createdAt.toISOString(),
            author: { id: r.authorId, name: names.get(r.authorId) ?? "Gelöschter Nutzer" },
            org: r.orgSlug ? { slug: r.orgSlug, name: r.orgName! } : null,
            likes: l,
            comments: c,
            likedByMe: liked.has(id),
            canDelete: r.authorId === userId || (await canModerate(r.orgId)),
            reason: reasonFor(relation, r.orgName, l, c),
          };
          return { post, relation };
        }),
    );
  }
}
