import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ActivityPage, ActivityPostRef, LikersPage, MyCommentItem, MyLikeItem, PublicUser } from "@vereine/shared";
import { UsersDirectory } from "../auth/users-directory.service";
import { ChatService } from "../chat/chat.service";
import { decodeCursor, encodeCursor } from "../common/cursor";
import { DB, type Database } from "../db/db.module";
import { comments, organizations, postLikes, postMedia, posts } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { ProfileAccess } from "../profiles/profile-access.service";

type PostLite = { id: string; authorId: string; orgId: string | null };

const PAGE = 20;
const LIKERS_PAGE = 30;
const MAX_MENTIONS = 5;
const MENTION = /(^|[^a-z0-9_@])@([a-z0-9_]{3,30})/gi;

/** Benutzernamen aus @Erwaehnungen (klein, ohne Doppelte, hoechstens 5). */
export function parseMentions(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(MENTION)) {
    out.add(m[2].toLowerCase());
    if (out.size >= MAX_MENTIONS) break;
  }
  return [...out];
}

/**
 * Aktivitaet rund um Beitraege: Erwaehnungen, Like-Buendelung, Like-Liste, "meine Likes/Kommentare".
 * Gemeinsame Regel fuer jede Benachrichtigung an eine andere Person: sie muss den Beitrag sehen duerfen und darf nicht
 * blockiert sein (in keine Richtung); sonst gibt es keine Benachrichtigung und damit keinen Hinweis auf den Beitrag.
 */
@Injectable()
export class ActivityService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(ProfileAccess) private readonly access: ProfileAccess,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
    @Inject(ChatService) private readonly chat: ChatService,
  ) {}

  /** Darf `recipientId` von einer Aktion von `actorId` an diesem Beitrag erfahren? */
  async canNotify(actorId: string, recipientId: string, post: PostLite): Promise<boolean> {
    if (recipientId === actorId) return false;
    if (!post.orgId && post.authorId !== recipientId && !(await this.access.canView(recipientId, post.authorId))) return false;
    return !(await this.chat.isBlockedBetween(actorId, recipientId));
  }

  /** Nach Like/Unlike eines Beitrags: gebuendelte Benachrichtigung des Autors angleichen. */
  async syncPostLike(actorId: string, post: PostLite): Promise<void> {
    if (post.authorId === actorId) return;
    const blocked = await this.chat.blockedWith(post.authorId);
    await this.notifications.syncLikeGroup("like", post.authorId, post.id, { postId: post.id }, blocked);
  }

  /** Nach Like/Unlike eines Kommentars: Benachrichtigung des Kommentar-Autors angleichen. */
  async syncCommentLike(actorId: string, comment: { id: string; authorId: string }, post: PostLite): Promise<void> {
    if (comment.authorId === actorId) return;
    // Sieht der Kommentar-Autor den Beitrag nicht mehr (privates Profil, Follower entfernt), gibt es keinen Hinweis.
    if (!post.orgId && post.authorId !== comment.authorId && !(await this.access.canView(comment.authorId, post.authorId))) return;
    const blocked = await this.chat.blockedWith(comment.authorId);
    await this.notifications.syncLikeGroup("comment_like", comment.authorId, comment.id, { postId: post.id, commentId: comment.id }, blocked);
  }

  /**
   * @Erwaehnungen in Beitrag oder Kommentar: Benachrichtigung nur an Personen, die den Beitrag sehen duerfen (und nicht
   * blockiert sind). Unbekannte Namen oder Personen ohne Zugriff erfahren nichts und der Autor auch nicht, wer betroffen war.
   * `skip`: Personen, die in derselben Aktion schon eine andere Benachrichtigung bekommen.
   */
  async notifyMentions(actor: PublicUser, post: PostLite, body: string, commentId: string | null, skip: Set<string>): Promise<void> {
    const handles = parseMentions(body);
    if (handles.length === 0) return;
    const targets = (await this.access.byHandles(handles)).map((p) => p.userId).filter((id) => id !== actor.id && !skip.has(id));
    const data: Record<string, string> = { postId: post.id, excerpt: body.slice(0, 80) };
    if (commentId) data.commentId = commentId;
    for (const id of targets) {
      if (await this.canNotify(actor.id, id, post)) await this.notifications.notify([id], "mention", data, { actorId: actor.id });
    }
  }

  /** Wer hat den Beitrag geliked? Nur Personen, die der Betrachter sehen darf (private Profile bleiben verborgen). */
  async likers(viewer: PublicUser, postId: string, cursor?: string): Promise<LikersPage> {
    const after = decodeCursor(cursor);
    const [rows, [{ n }]] = await Promise.all([
      this.db
        .select({ userId: postLikes.userId, at: postLikes.createdAt, ts: sql<string>`${postLikes.createdAt}::text` })
        .from(postLikes)
        .where(
          and(
            eq(postLikes.postId, postId),
            after ? sql`(${postLikes.createdAt}, ${postLikes.userId}) < (${after.ts}::timestamptz, ${after.id}::uuid)` : undefined,
          ),
        )
        .orderBy(desc(postLikes.createdAt), desc(postLikes.userId))
        .limit(LIKERS_PAGE + 1),
      this.db.select({ n: sql<number>`count(*)::int` }).from(postLikes).where(eq(postLikes.postId, postId)),
    ]);
    const page = rows.slice(0, LIKERS_PAGE);
    const last = page[page.length - 1];
    const ids = page.map((r) => r.userId);
    const [names, profs, viewable] = await Promise.all([this.directory.names(ids), this.access.ensureMany(ids), this.access.viewableOwners(viewer.id, ids)]);
    return {
      total: n,
      nextCursor: rows.length > LIKERS_PAGE && last ? encodeCursor({ ts: last.ts, id: last.userId }) : null,
      items: page
        .filter((r) => viewable.has(r.userId) && names.has(r.userId))
        .map((r) => ({
          id: r.userId,
          name: names.get(r.userId)!,
          handle: profs.get(r.userId)?.handle ?? null,
          avatarId: profs.get(r.userId)?.avatarMediaId ?? null,
          at: r.at.toISOString(),
        })),
    };
  }

  /** Meine Likes (neueste zuerst, Keyset-Paging); nur Beitraege, die ich noch sehen darf. */
  async myLikes(user: PublicUser, cursor?: string): Promise<ActivityPage<MyLikeItem>> {
    const after = decodeCursor(cursor);
    const found = await this.db
      .select({ postId: postLikes.postId, ts: sql<string>`${postLikes.createdAt}::text`, at: postLikes.createdAt })
      .from(postLikes)
      .innerJoin(posts, eq(posts.id, postLikes.postId))
      .where(
        and(
          eq(postLikes.userId, user.id),
          isNull(posts.deletedAt),
          isNull(posts.hiddenAt),
          after ? sql`(${postLikes.createdAt}, ${postLikes.postId}) < (${after.ts}::timestamptz, ${after.id}::uuid)` : undefined,
        ),
      )
      .orderBy(desc(postLikes.createdAt), desc(postLikes.postId))
      .limit(PAGE + 1);
    const page = found.slice(0, PAGE);
    const last = page[page.length - 1];
    const refs = await this.refs(user.id, page.map((p) => p.postId));
    return {
      nextCursor: found.length > PAGE && last ? encodeCursor({ ts: last.ts, id: last.postId }) : null,
      items: page.flatMap((p) => (refs.has(p.postId) ? [{ postId: p.postId, at: p.at.toISOString(), post: refs.get(p.postId)! }] : [])),
    };
  }

  /** Meine Kommentare und Antworten (neueste zuerst, Keyset-Paging). */
  async myComments(user: PublicUser, cursor?: string): Promise<ActivityPage<MyCommentItem>> {
    const after = decodeCursor(cursor);
    const found = await this.db
      .select({ id: comments.id, postId: comments.postId, body: comments.body, ts: sql<string>`${comments.createdAt}::text`, at: comments.createdAt })
      .from(comments)
      .innerJoin(posts, eq(posts.id, comments.postId))
      .where(
        and(
          eq(comments.authorId, user.id),
          isNull(posts.deletedAt),
          isNull(posts.hiddenAt),
          after ? sql`(${comments.createdAt}, ${comments.id}) < (${after.ts}::timestamptz, ${after.id}::uuid)` : undefined,
        ),
      )
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(PAGE + 1);
    const page = found.slice(0, PAGE);
    const last = page[page.length - 1];
    const refs = await this.refs(user.id, page.map((p) => p.postId));
    return {
      nextCursor: found.length > PAGE && last ? encodeCursor({ ts: last.ts, id: last.id }) : null,
      items: page.flatMap((p) => (refs.has(p.postId) ? [{ id: p.id, body: p.body, at: p.at.toISOString(), post: refs.get(p.postId)! }] : [])),
    };
  }

  /** Vorschau (Bild, Text, Absender) je Beitrag; Beitraege persoenlicher privater Profile ohne Zugriff fehlen. */
  private async refs(viewerId: string, postIds: string[]): Promise<Map<string, ActivityPostRef>> {
    if (postIds.length === 0) return new Map();
    const [rows, media] = await Promise.all([
      this.db
        .select({ id: posts.id, body: posts.body, authorId: posts.authorId, orgId: posts.orgId, orgName: organizations.name })
        .from(posts)
        .leftJoin(organizations, eq(organizations.id, posts.orgId))
        .where(inArray(posts.id, postIds)),
      this.db.select({ postId: postMedia.postId, mediaId: postMedia.mediaId }).from(postMedia).where(inArray(postMedia.postId, postIds)).orderBy(asc(postMedia.position)),
    ]);
    const personalAuthors = rows.filter((r) => !r.orgId).map((r) => r.authorId);
    const [viewable, names] = await Promise.all([this.access.viewableOwners(viewerId, personalAuthors), this.directory.names(personalAuthors)]);
    const first = new Map<string, string>();
    for (const m of media) if (!first.has(m.postId)) first.set(m.postId, m.mediaId);
    const out = new Map<string, ActivityPostRef>();
    for (const r of rows) {
      if (!r.orgId && !viewable.has(r.authorId)) continue;
      out.set(r.id, { id: r.id, mediaId: first.get(r.id) ?? null, text: r.body.slice(0, 80), by: r.orgName ?? names.get(r.authorId) ?? "Gelöschter Nutzer" });
    }
    return out;
  }
}
