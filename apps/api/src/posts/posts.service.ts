import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  CommentItem,
  CreatePostInput,
  FeedPost,
  FeedResponse,
  PublicUser,
  ReportInput,
} from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { comments, consents, follows, orgMembers, organizations, postLikes, posts, reports, users } from "../db/schema";
import { reasonFor, scorePost, type Relation } from "../feed/ranking";
import { OrgsService } from "../orgs/orgs.service";

const PUBLISH_ROLES = ["admin", "moderator"];
const CANDIDATES = 200;
const PAGE = 50;

@Injectable()
export class PostsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OrgsService) private readonly orgs: OrgsService,
  ) {}

  async create(user: PublicUser, input: CreatePostInput): Promise<FeedPost> {
    let orgId: string | null = null;
    if (input.orgSlug) {
      const org = await this.orgs.requireBySlug(input.orgSlug);
      const role = await this.orgs.activeRole(org.id, user.id);
      if (!role || !PUBLISH_ROLES.includes(role)) {
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

  async feed(user: PublicUser, requested: "ranked" | "chrono"): Promise<FeedResponse> {
    const personalized = requested === "ranked" && (await this.hasConsent(user.id));
    const relations = await this.relations(user.id);

    const rows = await this.db
      .select({ id: posts.id, orgId: posts.orgId, authorId: posts.authorId, createdAt: posts.createdAt })
      .from(posts)
      .where(isNull(posts.deletedAt))
      .orderBy(desc(posts.createdAt))
      .limit(CANDIDATES);

    const relationOf = (r: (typeof rows)[number]): Relation =>
      r.authorId === user.id ? "own" : r.orgId && relations.get(r.orgId) ? relations.get(r.orgId)! : "discover";

    // Eigene/gefolgte Quellen zuerst; bei zu wenig Inhalt mit oeffentlichen Beitraegen auffuellen.
    const relevant = rows.filter((r) => relationOf(r) !== "discover");
    const pool = relevant.length >= 10 ? relevant : rows;

    const ids = pool.map((r) => r.id);
    const hydrated = await this.hydrate(ids, user.id, relations);
    const byId = new Map(hydrated.map((p) => [p.id, p]));
    const now = Date.now();

    let ordered: FeedPost[];
    if (personalized) {
      ordered = pool
        .map((r) => {
          const p = byId.get(r.id)!;
          const relation = relationOf(r);
          return {
            p,
            score: scorePost({
              likes: p.likes,
              comments: p.comments,
              ageHours: (now - r.createdAt.getTime()) / 36e5,
              relation,
            }),
          };
        })
        .sort((a, b) => b.score - a.score)
        .map((x) => x.p);
    } else {
      ordered = pool.map((r) => byId.get(r.id)!); // bereits nach createdAt desc
    }
    return { mode: personalized ? "ranked" : "chrono", personalized, posts: ordered.slice(0, PAGE) };
  }

  async orgFeed(user: PublicUser, slug: string): Promise<FeedPost[]> {
    const org = await this.orgs.requireBySlug(slug);
    const rows = await this.db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.orgId, org.id), isNull(posts.deletedAt)))
      .orderBy(desc(posts.createdAt))
      .limit(PAGE);
    return this.hydrate(rows.map((r) => r.id), user.id, await this.relations(user.id));
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
      .select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, authorId: users.id, authorName: users.displayName })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.postId, postId))
      .orderBy(comments.createdAt)
      .limit(200);
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      author: { id: r.authorId, name: r.authorName },
    }));
  }

  async addComment(user: PublicUser, postId: string, body: string): Promise<CommentItem> {
    await this.requirePost(postId);
    const [row] = await this.db.insert(comments).values({ postId, authorId: user.id, body }).returning();
    return { id: row.id, body: row.body, createdAt: row.createdAt.toISOString(), author: { id: user.id, name: user.displayName } };
  }

  async report(user: PublicUser, postId: string, input: ReportInput): Promise<void> {
    await this.requirePost(postId);
    await this.db.insert(reports).values({ postId, reporterId: user.id, reason: input.reason, note: input.note });
  }

  async remove(user: PublicUser, postId: string): Promise<void> {
    const post = await this.requirePost(postId);
    const isAuthor = post.authorId === user.id;
    const role = post.orgId ? await this.orgs.activeRole(post.orgId, user.id) : null;
    if (!isAuthor && !(role && PUBLISH_ROLES.includes(role))) {
      throw new ForbiddenException("Du darfst diesen Beitrag nicht loeschen.");
    }
    await this.db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, postId));
  }

  // --- intern ---------------------------------------------------------------

  private async requirePost(id: string) {
    const [post] = await this.db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), isNull(posts.deletedAt)))
      .limit(1);
    if (!post) throw new NotFoundException("Beitrag nicht gefunden.");
    return post;
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

  private async hasConsent(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select()
      .from(consents)
      .where(and(eq(consents.userId, userId), eq(consents.purpose, "personalized_feed")))
      .orderBy(desc(consents.createdAt))
      .limit(1);
    return row?.granted ?? false;
  }

  /** Reichert Beitrags-IDs mit Autor, Verein, Zaehlern und Nutzer-Status an (Reihenfolge der ids bleibt). */
  private async hydrate(ids: string[], userId: string, relations: Map<string, Relation>): Promise<FeedPost[]> {
    if (ids.length === 0) return [];
    const [rows, likeCounts, commentCounts, mine] = await Promise.all([
      this.db
        .select({
          id: posts.id, body: posts.body, kind: posts.kind, createdAt: posts.createdAt,
          authorId: users.id, authorName: users.displayName,
          orgId: organizations.id, orgSlug: organizations.slug, orgName: organizations.name,
        })
        .from(posts)
        .innerJoin(users, eq(users.id, posts.authorId))
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

    const roleCache = new Map<string, Promise<string | null>>();
    const canModerate = async (orgId: string | null) => {
      if (!orgId) return false;
      if (!roleCache.has(orgId)) roleCache.set(orgId, this.orgs.activeRole(orgId, userId));
      const role = await roleCache.get(orgId)!;
      return !!role && PUBLISH_ROLES.includes(role);
    };

    return Promise.all(
      ids
        .filter((id) => byId.has(id))
        .map(async (id): Promise<FeedPost> => {
          const r = byId.get(id)!;
          const l = likes.get(id) ?? 0;
          const c = cmts.get(id) ?? 0;
          const relation: Relation = r.authorId === userId ? "own" : r.orgId ? relations.get(r.orgId) ?? "discover" : "discover";
          return {
            id: r.id,
            body: r.body,
            kind: r.kind as FeedPost["kind"],
            createdAt: r.createdAt.toISOString(),
            author: { id: r.authorId, name: r.authorName },
            org: r.orgSlug ? { slug: r.orgSlug, name: r.orgName! } : null,
            likes: l,
            comments: c,
            likedByMe: liked.has(id),
            canDelete: r.authorId === userId || (await canModerate(r.orgId)),
            reason: reasonFor(relation, r.orgName, l, c),
          };
        }),
    );
  }
}
