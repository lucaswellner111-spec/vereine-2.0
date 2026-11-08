import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gt, inArray, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import {
  isTagId,
  MAX_POST_TAGS,
  PROFILE_MEDIA_PAGE,
  type ProfileMediaPage,
  type CommentItem,
  type CreatePostInput,
  type FeedPost,
  type FeedResponse,
  type MutedItem,
  type PollView,
  type PublicPost,
  type PublicUser,
  type ReportInput,
  type UpdatePostInput,
} from "@vereine/shared";
import { UsersDirectory } from "../auth/users-directory.service";
import { CACHE, type Cache } from "../cache/cache.module";
import { decodeCursor, encodeCursor, type Cursor } from "../common/cursor";
import { invalidatePublicOrg } from "../common/public-cache";
import { enforceLimit, limitMessage } from "../common/rate-limit";
import { DB, type Database } from "../db/db.module";
import { comments, feedFeedback, follows, orgMembers, organizations, pollOptions, polls, pollVotes, postLikes, postMedia, posts, reports } from "../db/schema";
import { diversify, reasonFor, scorePost, type Relation } from "../feed/ranking";
import { MediaService } from "../media/media.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrgsService } from "../orgs/orgs.service";
import { ProfileAccess } from "../profiles/profile-access.service";

export const MODERATION_ROLES = ["admin", "moderator"];
const PAGE = 20;
/**
 * SKALIERUNG (Feed): Fan-out-on-read mit Index-Zugriff. Chrono-Feed nutzt Keyset-Paging ueber
 * posts(org_id, created_at). Das Ranking bewertet nur ein begrenztes Fenster (RANK_WINDOW,
 * 14 Tage) pro Anfrage; Affinitaeten werden aus zwei aggregierten Abfragen (30 Tage) gebildet.
 * Ab ~100k aktiven Nutzern: Ranking-Fenster + Affinitaeten pro Nutzer in Redis cachen (60 s) bzw.
 * Feeds vorberechnen (Fan-out-on-write) und Zaehler denormalisieren.
 */
const RANK_WINDOW = 150;
const RANK_DAYS = 14;
const AFFINITY_DAYS = 30;

const encode = encodeCursor;
const decode = decodeCursor;

type Muted = { posts: Set<string>; users: Set<string>; orgs: Set<string> };
/** Beziehungen, Moderationsrechte und Stummschaltungen des Betrachters (einmal je Anfrage geladen). */
type Ctx = { orgs: Map<string, Relation>; friends: Set<string>; muted: Muted; modOrgs: Set<string> };
const EMPTY_CTX: Ctx = { orgs: new Map(), friends: new Set(), muted: { posts: new Set(), users: new Set(), orgs: new Set() }, modOrgs: new Set() };

@Injectable()
export class PostsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
    @Inject(ProfileAccess) private readonly access: ProfileAccess,
    @Inject(MediaService) private readonly mediaSvc: MediaService,
    @Inject(CACHE) private readonly cache: Cache,
  ) {}

  async create(user: PublicUser, input: CreatePostInput): Promise<FeedPost> {
    await enforceLimit(this.cache, `post:create:${user.id}`, 60, 3600, limitMessage("neue Beiträge"));
    let orgId: string | null = null;
    let orgTags: string[] = [];
    if (input.orgSlug) {
      const org = await this.orgs.requireBySlug(input.orgSlug);
      const role = await this.orgs.activeRole(org.id, user.id);
      if (!role || !MODERATION_ROLES.includes(role)) {
        throw new ForbiddenException("Nur Vorstand und Moderation duerfen fuer den Verein posten.");
      }
      orgId = org.id;
      orgTags = org.tags;
    }
    const poll = input.poll;
    const row = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(posts)
        .values({ authorId: user.id, orgId, body: input.body, kind: input.kind, tags: input.tags.length ? input.tags : orgTags.slice(0, MAX_POST_TAGS) })
        .returning();
      if (poll) {
        await tx.insert(polls).values({ postId: created.id, question: poll.question, closesAt: poll.closesAt ? new Date(poll.closesAt) : null });
        await tx.insert(pollOptions).values(poll.options.map((label, position) => ({ postId: created.id, position, label })));
      }
      return created;
    });
    try {
      await this.mediaSvc.attach(user.id, row.id, input.mediaIds);
    } catch (err) {
      await this.db.delete(posts).where(eq(posts.id, row.id)); // kein halber Beitrag
      throw err;
    }
    // Rolle wurde oben geprueft: Vereinsbeitrag darf der Autor gleich bearbeiten
    const [post] = await this.hydrate([row.id], user.id, orgId ? { ...EMPTY_CTX, modOrgs: new Set([orgId]) } : EMPTY_CTX);
    return post;
  }

  /** Einzelner Beitrag (Detailseite): gleiche Sichtbarkeit wie Likes/Kommentare. */
  async get(user: PublicUser, postId: string): Promise<FeedPost> {
    await this.requirePost(postId, user.id);
    const [post] = await this.hydrate([postId], user.id, await this.context(user.id));
    return post;
  }

  /**
   * Text/Tags aendern: nur der Autor, bei Vereinsbeitraegen zusaetzlich mit Vorstand-/Moderationsrolle.
   * Bilder bleiben; leerer Text nur mit Bildern. Waehrend einer offenen Meldung gesperrt (Beweislage bleibt).
   */
  async update(user: PublicUser, postId: string, input: UpdatePostInput): Promise<FeedPost> {
    const post = await this.requirePost(postId, user.id);
    if (post.authorId !== user.id) throw new ForbiddenException("Nur der Autor darf den Beitrag bearbeiten.");
    if (post.orgId) {
      const role = await this.orgs.activeRole(post.orgId, user.id);
      if (!role || !MODERATION_ROLES.includes(role)) throw new ForbiddenException("Vereinsbeiträge bearbeiten nur Vorstand und Moderation.");
    }
    await enforceLimit(this.cache, `post:edit:${user.id}`, 60, 3600, limitMessage("Bearbeitungen"));
    if (!input.body) {
      const [img] = await this.db.select({ id: postMedia.mediaId }).from(postMedia).where(eq(postMedia.postId, postId)).limit(1);
      if (!img) throw new BadRequestException("Text oder Bild erforderlich.");
    }
    const [open] = await this.db
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.postId, postId), isNull(reports.commentId), eq(reports.status, "open")))
      .limit(1);
    if (open) throw new ConflictException("Beitrag wird geprüft und kann gerade nicht bearbeitet werden.");
    await this.db.update(posts).set({ body: input.body, tags: input.tags, editedAt: new Date() }).where(eq(posts.id, postId));
    if (post.orgId) await invalidatePublicOrg(this.cache, await this.orgs.slugOf(post.orgId));
    const [updated] = await this.hydrate([postId], user.id, await this.context(user.id));
    return updated;
  }

  // --- Feed ---------------------------------------------------------------------------------

  async feed(user: PublicUser, requested: "ranked" | "chrono", cursor?: string, tag?: string): Promise<FeedResponse> {
    const personalized = requested === "ranked" && (await this.hasConsent(user.id));
    const ctx = await this.context(user.id);
    const orgIds = [...ctx.orgs.keys()];
    const friendIds = [...ctx.friends];
    const relevant = and(
      isNull(posts.deletedAt),
      isNull(posts.hiddenAt),
      this.mutedFilter(ctx.muted),
      or(
        eq(posts.authorId, user.id),
        orgIds.length ? inArray(posts.orgId, orgIds) : undefined,
        friendIds.length ? and(isNull(posts.orgId), inArray(posts.authorId, friendIds)) : undefined,
      ),
    );

    // Tag-Filter: alle sichtbaren Vereinsbeitraege mit diesem Tag (auch von nicht gefolgten Vereinen) plus eigene/Freunde.
    if (tag && isTagId(tag)) {
      const where = and(
        isNull(posts.deletedAt),
        isNull(posts.hiddenAt),
        this.mutedFilter(ctx.muted),
        sql`${posts.tags} @> ARRAY[${tag}]::text[]`,
        or(sql`${posts.orgId} is not null`, eq(posts.authorId, user.id), friendIds.length ? inArray(posts.authorId, friendIds) : undefined),
      );
      const page = await this.chronoPage(where, decode(cursor));
      return { mode: "chrono", personalized: false, posts: await this.hydrate(page.ids, user.id, ctx), nextCursor: page.nextCursor };
    }

    if (!personalized) {
      const page = await this.chronoPage(relevant, decode(cursor));
      let ids = page.ids;
      if (!cursor && ids.length < PAGE) ids = [...ids, ...(await this.discover(user.id, orgIds, ctx.muted, PAGE - ids.length))];
      return { mode: "chrono", personalized: false, posts: await this.hydrate(ids, user.id, ctx), nextCursor: page.nextCursor };
    }

    // Personalisiert (Einwilligung): Kandidaten -> Score -> Vielfalt -> Exploration (siehe SKALIERUNG oben).
    const offset = cursor?.startsWith("r:") ? Math.max(0, Number(cursor.slice(2)) || 0) : 0;
    const since = new Date(Date.now() - RANK_DAYS * 864e5);
    const window = await this.db
      .select({ id: posts.id })
      .from(posts)
      .where(and(relevant, gt(posts.createdAt, since)))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(RANK_WINDOW);
    let ids = window.map((r) => r.id);
    if (offset === 0 && ids.length < PAGE) ids = [...ids, ...(await this.discover(user.id, orgIds, ctx.muted, PAGE - ids.length))];

    const [hydrated, affinity] = await Promise.all([this.hydrateWithRelation(ids, user.id, ctx), this.affinities(user.id)]);
    const now = Date.now();
    const scored = hydrated.map(({ post: p, relation }) => {
      const key = p.org ? `o:${p.org.slug}` : `u:${p.author.id}`;
      const a = affinity.get(p.org ? `o:${p.orgId}` : `u:${p.author.id}`) ?? 0;
      return {
        p,
        key,
        score: scorePost({
          likes: p.likes,
          comments: p.comments,
          ageHours: (now - new Date(p.createdAt).getTime()) / 36e5,
          relation,
          affinity: a,
          hasMedia: p.media.length > 0,
          kind: p.kind,
        }),
        affinity: a,
        relation,
      };
    });
    let ranked: FeedPost[] = diversify(scored).map((x) => {
      // Begruendung um die Affinitaet ergaenzen (nur wenn sie spuerbar war)
      if (x.affinity >= 3) x.p.reason = reasonFor(x.relation, x.p.org?.name ?? null, x.p.likes, x.p.comments, { affinity: x.affinity, authorName: x.p.author.name });
      return x.p;
    });

    // Exploration: auf der ersten Seite bis zu 2 oeffentliche Vereinsbeitraege einmischen, damit der Feed nicht abschottet.
    if (offset === 0) {
      const have = new Set(ranked.map((p) => p.id));
      const extra = (await this.discover(user.id, orgIds, ctx.muted, 4)).filter((id) => !have.has(id)).slice(0, 2);
      if (extra.length) {
        const explore = await this.hydrate(extra, user.id, ctx);
        ranked = [...ranked];
        [5, 13].forEach((pos, i) => explore[i] && ranked.splice(Math.min(pos, ranked.length), 0, explore[i]));
      }
    }
    const slice = ranked.slice(offset, offset + PAGE).map((p) => {
      const { orgId: _o, ...rest } = p as FeedPost & { orgId?: string | null };
      return rest as FeedPost;
    });
    return {
      mode: "ranked",
      personalized: true,
      posts: slice,
      nextCursor: offset + PAGE < ranked.length ? `r:${offset + PAGE}` : null,
    };
  }

  async orgFeed(user: PublicUser, slug: string, cursor?: string): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
    const org = await this.orgs.requireBySlug(slug);
    const page = await this.chronoPage(and(eq(posts.orgId, org.id), isNull(posts.deletedAt), isNull(posts.hiddenAt)), decode(cursor));
    return { posts: await this.hydrate(page.ids, user.id, await this.context(user.id)), nextCursor: page.nextCursor };
  }

  /** Persoenliche Beitraege einer Person (Profil). Bei privaten Profilen nur fuer Follower. */
  async userPosts(viewer: PublicUser, handle: string, cursor?: string): Promise<{ posts: FeedPost[]; nextCursor: string | null; locked: boolean }> {
    const profile = await this.access.byHandle(handle);
    if (!profile) throw new NotFoundException("Profil nicht gefunden.");
    if (!(await this.access.canView(viewer.id, profile.userId))) return { posts: [], nextCursor: null, locked: true };
    const page = await this.chronoPage(
      and(eq(posts.authorId, profile.userId), isNull(posts.orgId), isNull(posts.deletedAt), isNull(posts.hiddenAt)),
      decode(cursor),
    );
    return { posts: await this.hydrate(page.ids, viewer.id, await this.context(viewer.id)), nextCursor: page.nextCursor, locked: false };
  }

  /** Profil-Fotos: nur persoenliche Beitraege mit Bildern, gleiche Sichtbarkeitsregel wie userPosts. */
  async userMedia(viewer: PublicUser, handle: string, cursor?: string): Promise<ProfileMediaPage> {
    const profile = await this.access.byHandle(handle);
    if (!profile) throw new NotFoundException("Profil nicht gefunden.");
    if (!(await this.access.canView(viewer.id, profile.userId))) return { posts: [], nextCursor: null, locked: true };
    const page = await this.chronoPage(
      and(
        eq(posts.authorId, profile.userId),
        isNull(posts.orgId),
        isNull(posts.deletedAt),
        isNull(posts.hiddenAt),
        sql`exists (select 1 from ${postMedia} where ${postMedia.postId} = ${posts.id})`,
      ),
      decode(cursor),
      PROFILE_MEDIA_PAGE,
    );
    return { posts: await this.hydrate(page.ids, viewer.id, await this.context(viewer.id)), nextCursor: page.nextCursor, locked: false };
  }

  // --- Feedback ("Weniger davon") ------------------------------------------------------------

  async feedback(user: PublicUser, postId: string, kind: "hide" | "mute_author" | "mute_org"): Promise<void> {
    const post = await this.requirePost(postId, user.id);
    let row: { targetKind: string; targetId: string };
    if (kind === "hide") row = { targetKind: "post", targetId: post.id };
    else if (kind === "mute_org") {
      if (!post.orgId) throw new BadRequestException("Dieser Beitrag gehoert zu keinem Verein.");
      row = { targetKind: "org", targetId: post.orgId };
    } else {
      if (post.orgId) throw new BadRequestException("Bei Vereinsbeitraegen bitte den Verein stummschalten.");
      if (post.authorId === user.id) throw new BadRequestException("Du kannst dich nicht selbst stummschalten.");
      row = { targetKind: "user", targetId: post.authorId };
    }
    await this.db.insert(feedFeedback).values({ userId: user.id, ...row }).onConflictDoNothing();
  }

  async muted(user: PublicUser): Promise<MutedItem[]> {
    const rows = await this.db.select().from(feedFeedback).where(eq(feedFeedback.userId, user.id)).orderBy(desc(feedFeedback.createdAt)).limit(200);
    const byKind = (k: string) => rows.filter((r) => r.targetKind === k).map((r) => r.targetId);
    const [names, orgRows, postRows] = await Promise.all([
      this.directory.names(byKind("user")),
      byKind("org").length ? this.db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.id, byKind("org"))) : [],
      byKind("post").length ? this.db.select({ id: posts.id, body: posts.body }).from(posts).where(inArray(posts.id, byKind("post"))) : [],
    ]);
    const orgName = new Map(orgRows.map((o) => [o.id, o.name]));
    const postBody = new Map(postRows.map((p) => [p.id, p.body]));
    return rows.map((r) => ({
      kind: r.targetKind as MutedItem["kind"],
      id: r.targetId,
      label:
        r.targetKind === "user" ? names.get(r.targetId) ?? "Gelöschter Nutzer"
        : r.targetKind === "org" ? orgName.get(r.targetId) ?? "Verein"
        : (postBody.get(r.targetId) ?? "Beitrag").slice(0, 60),
    }));
  }

  async unmute(user: PublicUser, kind: string, id: string): Promise<void> {
    await this.db.delete(feedFeedback).where(and(eq(feedFeedback.userId, user.id), eq(feedFeedback.targetKind, kind), eq(feedFeedback.targetId, id)));
  }

  // --- Interaktionen ---------------------------------------------------------------------------

  async toggleLike(user: PublicUser, postId: string): Promise<{ liked: boolean; likes: number }> {
    await this.requirePost(postId, user.id);
    const removed = await this.db
      .delete(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, user.id)))
      .returning();
    if (removed.length === 0) await this.db.insert(postLikes).values({ postId, userId: user.id }).onConflictDoNothing(); // parallele Klicks
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(postLikes).where(eq(postLikes.postId, postId));
    return { liked: removed.length === 0, likes: n };
  }

  async listComments(user: PublicUser, postId: string): Promise<CommentItem[]> {
    await this.requirePost(postId, user.id);
    const rows = await this.db
      .select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, authorId: comments.authorId })
      .from(comments)
      .where(eq(comments.postId, postId))
      .orderBy(comments.createdAt)
      .limit(200);
    const [names, profs] = await Promise.all([this.directory.names(rows.map((r) => r.authorId)), this.access.ensureMany(rows.map((r) => r.authorId))]);
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      author: { id: r.authorId, name: names.get(r.authorId) ?? "Gelöschter Nutzer", handle: profs.get(r.authorId)?.handle ?? null },
    }));
  }

  async addComment(user: PublicUser, postId: string, body: string): Promise<CommentItem> {
    const post = await this.requirePost(postId, user.id);
    await enforceLimit(this.cache, `comment:create:${user.id}`, 100, 3600, limitMessage("Kommentare"));
    const [row] = await this.db.insert(comments).values({ postId, authorId: user.id, body }).returning();
    if (post.authorId !== user.id) {
      await this.notifications.notify([post.authorId], "comment", { postId, commenter: user.displayName, excerpt: body.slice(0, 80) });
    }
    const mine = await this.access.ensure(user.id);
    return { id: row.id, body: row.body, createdAt: row.createdAt.toISOString(), author: { id: user.id, name: user.displayName, handle: mine?.handle ?? null } };
  }

  /** Kommentar loeschen: eigene Kommentare (auch unter ausgeblendeten/geloeschten Beitraegen) oder unter eigenen persoenlichen Beitraegen. */
  async deleteComment(user: PublicUser, commentId: string): Promise<void> {
    const [row] = await this.db
      .select({ authorId: comments.authorId, postAuthorId: posts.authorId, postOrgId: posts.orgId })
      .from(comments)
      .innerJoin(posts, eq(posts.id, comments.postId))
      .where(eq(comments.id, commentId))
      .limit(1);
    if (!row) throw new NotFoundException("Kommentar nicht gefunden.");
    const ownComment = row.authorId === user.id;
    const ownPersonalPost = row.postAuthorId === user.id && !row.postOrgId;
    if (!ownComment && !ownPersonalPost) throw new ForbiddenException("Du darfst diesen Kommentar nicht löschen.");
    await this.db.delete(comments).where(eq(comments.id, commentId));
  }

  /** Meldung: je Person hoechstens eine offene Meldung pro Beitrag (Wiederholung = 204 ohne neue Zeile). */
  async report(user: PublicUser, postId: string, input: ReportInput): Promise<void> {
    const post = await this.requirePost(postId, user.id);
    const [open] = await this.db
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.postId, postId), isNull(reports.commentId), eq(reports.reporterId, user.id), eq(reports.status, "open")))
      .limit(1);
    if (open) return;
    await enforceLimit(this.cache, `report:${user.id}`, 30, 3600, limitMessage("Meldungen"));
    await this.db
      .insert(reports)
      .values({ postId, orgId: post.orgId, reporterId: user.id, reason: input.reason, note: input.note })
      .onConflictDoNothing(); // partieller Unique-Index (post_id, reporter_id) where status='open' and comment_id is null
  }

  /**
   * Kommentar melden: wer den Beitrag sehen darf, nicht den eigenen. Landet in der Queue des Vereins
   * (Vereinsbeitrag) bzw. der Plattform (persoenlicher Beitrag); je Person eine offene Meldung pro Kommentar.
   */
  async reportComment(user: PublicUser, commentId: string, input: ReportInput): Promise<void> {
    const [c] = await this.db.select({ postId: comments.postId, authorId: comments.authorId }).from(comments).where(eq(comments.id, commentId)).limit(1);
    if (!c) throw new NotFoundException("Kommentar nicht gefunden.");
    const post = await this.requirePost(c.postId, user.id);
    if (c.authorId === user.id) throw new BadRequestException("Eigene Kommentare kannst du nicht melden.");
    const [open] = await this.db
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.commentId, commentId), eq(reports.reporterId, user.id), eq(reports.status, "open")))
      .limit(1);
    if (open) return;
    await enforceLimit(this.cache, `report:${user.id}`, 30, 3600, limitMessage("Meldungen"));
    await this.db
      .insert(reports)
      .values({ postId: post.id, commentId, orgId: post.orgId, reporterId: user.id, reason: input.reason, note: input.note })
      .onConflictDoNothing(); // partieller Unique-Index (comment_id, reporter_id) where status='open'
  }

  async remove(user: PublicUser, postId: string): Promise<void> {
    const post = await this.requirePost(postId, user.id);
    const role = post.orgId ? await this.orgs.activeRole(post.orgId, user.id) : null;
    if (post.authorId !== user.id && !(role && MODERATION_ROLES.includes(role))) {
      throw new ForbiddenException("Du darfst diesen Beitrag nicht loeschen.");
    }
    await this.db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, postId));
    await this.mediaSvc.deleteForPost(postId); // Bilder werden mit dem Beitrag entfernt (Datenminimierung)
    if (post.orgId) await invalidatePublicOrg(this.cache, await this.orgs.slugOf(post.orgId));
  }

  // --- Umfragen ---------------------------------------------------------------------------------

  /**
   * Stimme abgeben oder aendern (Einfachwahl, eine Zeile je Person dank Primaerschluessel). Zaehler pflegt der
   * Trigger poll_votes_count; parallele Stimmen serialisiert die Zeilensperre auf der Option.
   */
  async vote(user: PublicUser, postId: string, optionId: string): Promise<PollView> {
    const poll = await this.requireOpenPoll(user, postId);
    const [option] = await this.db
      .select({ id: pollOptions.id })
      .from(pollOptions)
      .where(and(eq(pollOptions.id, optionId), eq(pollOptions.postId, poll.postId)))
      .limit(1);
    if (!option) throw new BadRequestException("Diese Antwort gehört nicht zur Umfrage.");
    await enforceLimit(this.cache, `poll:vote:${user.id}`, 120, 3600, limitMessage("Abstimmungen"));
    await this.db
      .insert(pollVotes)
      .values({ postId, optionId, userId: user.id })
      .onConflictDoUpdate({
        target: [pollVotes.postId, pollVotes.userId],
        set: { optionId, createdAt: sql`now()` },
        setWhere: sql`${pollVotes.optionId} <> excluded.option_id`,
      });
    return (await this.pollsFor([postId], user.id)).get(postId)!;
  }

  /** Eigene Stimme zuruecknehmen (bis zum Ende der Umfrage). */
  async unvote(user: PublicUser, postId: string): Promise<PollView> {
    await this.requireOpenPoll(user, postId);
    await this.db.delete(pollVotes).where(and(eq(pollVotes.postId, postId), eq(pollVotes.userId, user.id)));
    return (await this.pollsFor([postId], user.id)).get(postId)!;
  }

  private async requireOpenPoll(user: PublicUser, postId: string) {
    await this.requirePost(postId, user.id);
    const [poll] = await this.db.select().from(polls).where(eq(polls.postId, postId)).limit(1);
    if (!poll) throw new NotFoundException("Dieser Beitrag hat keine Umfrage.");
    if (poll.closesAt && poll.closesAt.getTime() <= Date.now()) throw new BadRequestException("Die Umfrage ist beendet.");
    return poll;
  }

  /** Umfragen gesammelt laden (drei Abfragen fuer alle Beitraege einer Seite). Nur Zahlen und die eigene Wahl. */
  private async pollsFor(postIds: string[], userId: string): Promise<Map<string, PollView>> {
    if (postIds.length === 0) return new Map();
    const pollRows = await this.db.select().from(polls).where(inArray(polls.postId, postIds));
    if (pollRows.length === 0) return new Map();
    const ids = pollRows.map((p) => p.postId);
    const [opts, mine] = await Promise.all([
      this.db.select().from(pollOptions).where(inArray(pollOptions.postId, ids)).orderBy(pollOptions.postId, pollOptions.position),
      this.db.select({ postId: pollVotes.postId, optionId: pollVotes.optionId }).from(pollVotes).where(and(inArray(pollVotes.postId, ids), eq(pollVotes.userId, userId))),
    ]);
    const myVote = new Map(mine.map((v) => [v.postId, v.optionId]));
    const now = Date.now();
    return new Map(
      pollRows.map((p) => {
        const options = opts.filter((o) => o.postId === p.postId).map((o) => ({ id: o.id, label: o.label, votes: o.votes }));
        return [
          p.postId,
          {
            question: p.question,
            options,
            total: options.reduce((n, o) => n + o.votes, 0),
            myOptionId: myVote.get(p.postId) ?? null,
            closesAt: p.closesAt?.toISOString() ?? null,
            closed: !!p.closesAt && p.closesAt.getTime() <= now,
          },
        ];
      }),
    );
  }

  /** Auskunft (Art. 15): eigene Umfragestimmen mit Frage und gewaehlter Antwort. */
  async exportVotes(userId: string): Promise<{ postId: string; question: string; answer: string; at: string }[]> {
    const rows = await this.db
      .select({ postId: pollVotes.postId, question: polls.question, answer: pollOptions.label, at: pollVotes.createdAt })
      .from(pollVotes)
      .innerJoin(polls, eq(polls.postId, pollVotes.postId))
      .innerJoin(pollOptions, eq(pollOptions.id, pollVotes.optionId))
      .where(eq(pollVotes.userId, userId));
    return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
  }

  // --- Oeffentlicher Bereich ----------------------------------------------------------------------

  /** Letzte Vereinsbeitraege fuer die oeffentliche Seite: nur Text, Datum, Tags (ohne Autor, Bilder, Kommentare, Likes). */
  async publicRecent(orgId: string, limit = 10): Promise<PublicPost[]> {
    const rows = await this.db
      .select({ body: posts.body, createdAt: posts.createdAt, tags: posts.tags })
      .from(posts)
      .where(and(eq(posts.orgId, orgId), isNull(posts.deletedAt), isNull(posts.hiddenAt), ne(posts.body, "")))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(limit);
    return rows.map((r) => ({ body: r.body, createdAt: r.createdAt.toISOString(), tags: r.tags }));
  }

  // --- intern -----------------------------------------------------------------------------------

  /** Beitrag laden; persoenliche Beitraege privater Profile sind fuer Nicht-Follower "nicht gefunden". */
  private async requirePost(id: string, viewerId: string) {
    const [post] = await this.db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), isNull(posts.deletedAt), isNull(posts.hiddenAt)))
      .limit(1);
    if (!post) throw new NotFoundException("Beitrag nicht gefunden.");
    if (!post.orgId && post.authorId !== viewerId && !(await this.access.canView(viewerId, post.authorId))) {
      throw new NotFoundException("Beitrag nicht gefunden.");
    }
    return post;
  }

  private mutedFilter(m: Muted): SQL | undefined {
    return and(
      m.posts.size ? notInArray(posts.id, [...m.posts]) : undefined,
      m.users.size ? or(sql`${posts.orgId} is not null`, notInArray(posts.authorId, [...m.users])) : undefined,
      m.orgs.size ? or(isNull(posts.orgId), notInArray(posts.orgId, [...m.orgs])) : undefined,
    );
  }

  /** Keyset-Paging (created_at, id) absteigend; Zeitstempel bleibt als Text mikrosekundengenau. */
  private async chronoPage(where: SQL | undefined, after: Cursor | null, size = PAGE) {
    const rows = await this.db
      .select({ id: posts.id, ts: sql<string>`${posts.createdAt}::text` })
      .from(posts)
      .where(and(where, after ? sql`(${posts.createdAt}, ${posts.id}) < (${after.ts}::timestamptz, ${after.id}::uuid)` : undefined))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(size + 1);
    const page = rows.slice(0, size);
    const last = page[page.length - 1];
    return {
      ids: page.map((r) => r.id),
      nextCursor: rows.length > size && last ? encode({ ts: last.ts, id: last.id }) : null,
    };
  }

  /** Oeffentliche Vereinsbeitraege, die der Nutzer noch nicht ueber Follow/Mitgliedschaft sieht (ohne Stummgeschaltetes). */
  private async discover(userId: string, orgIds: string[], muted: Muted, limit: number): Promise<string[]> {
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
          this.mutedFilter(muted),
        ),
      )
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  /** Beziehungen (Vereine, Freunde) und Stummschaltungen des Betrachters. */
  private async context(userId: string): Promise<Ctx> {
    const [followed, member, friends, feedback] = await Promise.all([
      this.db.select({ orgId: follows.orgId }).from(follows).where(eq(follows.userId, userId)),
      this.db.select({ orgId: orgMembers.orgId, role: orgMembers.role }).from(orgMembers).where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, "active"))),
      this.access.followedUserIds(userId),
      this.db.select().from(feedFeedback).where(eq(feedFeedback.userId, userId)),
    ]);
    const orgs = new Map<string, Relation>();
    followed.forEach((f) => orgs.set(f.orgId, "follow"));
    member.forEach((m) => orgs.set(m.orgId, "member"));
    const set = (k: string) => new Set(feedback.filter((f) => f.targetKind === k).map((f) => f.targetId));
    const modOrgs = new Set(member.filter((m) => MODERATION_ROLES.includes(m.role)).map((m) => m.orgId));
    return { orgs, friends: new Set(friends), muted: { posts: set("post"), users: set("user"), orgs: set("org") }, modOrgs };
  }

  /** Affinitaet: Likes (1) und Kommentare (2) des Betrachters der letzten 30 Tage je Autor (persoenlich) bzw. Verein. */
  private async affinities(userId: string): Promise<Map<string, number>> {
    const since = new Date(Date.now() - AFFINITY_DAYS * 864e5);
    const [likeRows, commentRows] = await Promise.all([
      this.db
        .select({ authorId: posts.authorId, orgId: posts.orgId, n: sql<number>`count(*)::int` })
        .from(postLikes)
        .innerJoin(posts, eq(posts.id, postLikes.postId))
        .where(and(eq(postLikes.userId, userId), gt(postLikes.createdAt, since)))
        .groupBy(posts.authorId, posts.orgId),
      this.db
        .select({ authorId: posts.authorId, orgId: posts.orgId, n: sql<number>`count(*)::int` })
        .from(comments)
        .innerJoin(posts, eq(posts.id, comments.postId))
        .where(and(eq(comments.authorId, userId), gt(comments.createdAt, since)))
        .groupBy(posts.authorId, posts.orgId),
    ]);
    const out = new Map<string, number>();
    const add = (rows: { authorId: string; orgId: string | null; n: number }[], weight: number) =>
      rows.forEach((r) => {
        const key = r.orgId ? `o:${r.orgId}` : `u:${r.authorId}`;
        out.set(key, (out.get(key) ?? 0) + weight * r.n);
      });
    add(likeRows, 1);
    add(commentRows, 2);
    return out;
  }

  private hasConsent(userId: string): Promise<boolean> {
    return this.directory.hasConsent(userId, "personalized_feed");
  }

  private async hydrate(ids: string[], userId: string, ctx: Ctx): Promise<FeedPost[]> {
    return (await this.hydrateWithRelation(ids, userId, ctx)).map(({ post: { orgId: _o, ...p } }) => p);
  }

  /** Reichert Beitrags-IDs mit Autor, Profil, Verein, Bildern, Zaehlern und Nutzer-Status an (Reihenfolge der ids bleibt). */
  private async hydrateWithRelation(ids: string[], userId: string, ctx: Ctx): Promise<{ post: FeedPost & { orgId: string | null }; relation: Relation }[]> {
    if (ids.length === 0) return [];
    const [rows, likeCounts, commentCounts, mine, mediaMap, pollMap] = await Promise.all([
      this.db
        .select({
          id: posts.id, body: posts.body, kind: posts.kind, tags: posts.tags, createdAt: posts.createdAt, editedAt: posts.editedAt, authorId: posts.authorId,
          orgId: organizations.id, orgSlug: organizations.slug, orgName: organizations.name, orgLogo: organizations.logoMediaId,
        })
        .from(posts)
        .leftJoin(organizations, eq(organizations.id, posts.orgId))
        .where(inArray(posts.id, ids)),
      this.db.select({ id: postLikes.postId, n: sql<number>`count(*)::int` }).from(postLikes).where(inArray(postLikes.postId, ids)).groupBy(postLikes.postId),
      this.db.select({ id: comments.postId, n: sql<number>`count(*)::int` }).from(comments).where(inArray(comments.postId, ids)).groupBy(comments.postId),
      this.db.select({ id: postLikes.postId }).from(postLikes).where(and(inArray(postLikes.postId, ids), eq(postLikes.userId, userId))),
      this.mediaSvc.forPosts(ids),
      this.pollsFor(ids, userId),
    ]);
    const likes = new Map(likeCounts.map((r) => [r.id, r.n]));
    const cmts = new Map(commentCounts.map((r) => [r.id, r.n]));
    const liked = new Set(mine.map((r) => r.id));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const authorIds = rows.map((r) => r.authorId);
    const [names, profs] = await Promise.all([this.directory.names(authorIds), this.access.ensureMany(authorIds)]);

    // Moderationsrechte kommen aus dem Kontext (eine Abfrage je Anfrage statt einer je Verein).
    const canModerate = (orgId: string | null) => !!orgId && ctx.modOrgs.has(orgId);

    return Promise.all(
      ids
        .filter((id) => byId.has(id))
        .map(async (id) => {
          const r = byId.get(id)!;
          const l = likes.get(id) ?? 0;
          const c = cmts.get(id) ?? 0;
          const relation: Relation =
            r.authorId === userId ? "own"
            : r.orgId ? ctx.orgs.get(r.orgId) ?? "discover"
            : ctx.friends.has(r.authorId) ? "friend"
            : "discover";
          const authorName = names.get(r.authorId) ?? "Gelöschter Nutzer";
          const prof = profs.get(r.authorId);
          const post = {
            id: r.id,
            body: r.body,
            kind: r.kind as FeedPost["kind"],
            tags: r.tags,
            createdAt: r.createdAt.toISOString(),
            author: { id: r.authorId, name: authorName, handle: prof?.handle ?? null, avatarId: prof?.avatarMediaId ?? null },
            org: r.orgSlug ? { slug: r.orgSlug, name: r.orgName!, logoId: r.orgLogo } : null,
            media: mediaMap.get(r.id) ?? [],
            likes: l,
            comments: c,
            likedByMe: liked.has(id),
            canDelete: r.authorId === userId || canModerate(r.orgId),
            canEdit: r.authorId === userId && (!r.orgId || canModerate(r.orgId)),
            editedAt: r.editedAt?.toISOString() ?? null,
            poll: pollMap.get(r.id) ?? null,
            reason: reasonFor(relation, r.orgName, l, c, { authorName }),
            orgId: r.orgId,
          };
          return { post, relation };
        }),
    );
  }
}
