import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { ModerationCommentItem, ModerationPostItem, PublicUser, ReportItem, ResolveReportInput } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { AuditService } from "../auth/audit.service";
import { UsersDirectory } from "../auth/users-directory.service";
import { comments, organizations, posts, reports } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { OrgsService } from "../orgs/orgs.service";
import { MODERATION_ROLES } from "./posts.service";

/**
 * Moderation auf Vereinsebene (DSA-konform: Meldeweg, Entscheidung mit Begruendung, Benachrichtigung
 * des Autors). Meldungen zu persoenlichen Beitraegen ohne Verein (orgId = null) braucht spaeter
 * eine Plattform-Moderation (Rolle platform_admin) - siehe Plan.
 */
@Injectable()
export class ModerationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async requireModerator(orgId: string, userId: string) {
    const role = await this.orgs.activeRole(orgId, userId);
    if (!role || !MODERATION_ROLES.includes(role)) throw new ForbiddenException("Nur Vorstand und Moderation.");
  }

  /** Plattform-Moderation: Meldungen zu Beitraegen OHNE Verein (persoenliche Beitraege). */
  async listPlatform(admin: PublicUser, status = "open"): Promise<ReportItem[]> {
    await this.audit.record(admin.id, "platform.reports.listed", { status });
    return this.query(sql`${reports.orgId} is null`, status);
  }

  async resolvePlatform(admin: PublicUser, reportId: string, input: ResolveReportInput): Promise<void> {
    const [report] = await this.db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
    if (!report) throw new NotFoundException("Meldung nicht gefunden.");
    if (report.orgId) throw new ForbiddenException("Diese Meldung gehoert zur Vereins-Moderation.");
    await this.apply(admin.id, report, input);
    await this.audit.record(admin.id, "platform.report.resolved", { reportId, action: input.action });
  }

  async list(user: PublicUser, slug: string, status = "open"): Promise<ReportItem[]> {
    const org = await this.orgs.requireBySlug(slug);
    await this.requireModerator(org.id, user.id);
    return this.query(eq(reports.orgId, org.id), status);
  }

  private async query(scope: SQL, status: string): Promise<ReportItem[]> {
    const rows = await this.db
      .select({
        id: reports.id,
        reason: reports.reason,
        note: reports.note,
        createdAt: reports.createdAt,
        postId: posts.id,
        body: posts.body,
        hidden: posts.hiddenAt,
        authorId: posts.authorId,
      })
      .from(reports)
      .innerJoin(posts, eq(posts.id, reports.postId))
      .where(and(scope, eq(reports.status, status)))
      .orderBy(desc(reports.createdAt))
      .limit(100);
    const names = await this.directory.names(rows.map((r) => r.authorId));
    return rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      post: { id: r.postId, body: r.body, authorName: names.get(r.authorId) ?? "Gelöschter Nutzer", hidden: !!r.hidden },
    }));
  }

  async resolve(user: PublicUser, reportId: string, input: ResolveReportInput): Promise<void> {
    const [report] = await this.db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
    if (!report) throw new NotFoundException("Meldung nicht gefunden.");
    if (!report.orgId) throw new ForbiddenException("Diese Meldung gehoert zur Plattform-Moderation.");
    await this.requireModerator(report.orgId, user.id);
    await this.apply(user.id, report, input);
  }

  // --- Werkzeug: Beitraege und Kommentare des Vereins ------------------------------------------

  /** Beitraege des Vereins (auch ausgeblendete) mit Zaehlern; filter: all | hidden | reported. */
  async posts(user: PublicUser, slug: string, filter: "all" | "hidden" | "reported", offset = 0): Promise<ModerationPostItem[]> {
    const org = await this.orgs.requireBySlug(slug);
    await this.requireModerator(org.id, user.id);
    const openReports = sql<number>`(select count(*)::int from social.reports r where r.post_id = social.posts.id and r.status = 'open')`;
    const commentCount = sql<number>`(select count(*)::int from social.comments c where c.post_id = social.posts.id)`;
    const rows = await this.db
      .select({
        id: posts.id, body: posts.body, authorId: posts.authorId, createdAt: posts.createdAt, tags: posts.tags,
        hiddenAt: posts.hiddenAt, hiddenReason: posts.hiddenReason, comments: commentCount, openReports,
      })
      .from(posts)
      .where(
        and(
          eq(posts.orgId, org.id),
          isNull(posts.deletedAt),
          filter === "hidden" ? sql`${posts.hiddenAt} is not null` : undefined,
          filter === "reported" ? sql`${openReports} > 0` : undefined,
        ),
      )
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(50)
      .offset(Math.max(0, offset));
    const names = await this.directory.names(rows.map((r) => r.authorId));
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      authorName: names.get(r.authorId) ?? "Gelöschter Nutzer",
      createdAt: r.createdAt.toISOString(),
      tags: r.tags,
      hidden: !!r.hiddenAt,
      hiddenReason: r.hiddenReason,
      comments: r.comments,
      openReports: r.openReports,
    }));
  }

  private async orgPost(user: PublicUser, postId: string) {
    const [post] = await this.db.select().from(posts).where(and(eq(posts.id, postId), isNull(posts.deletedAt))).limit(1);
    if (!post || !post.orgId) throw new NotFoundException("Beitrag nicht gefunden.");
    await this.requireModerator(post.orgId, user.id);
    return post;
  }

  /** Beitrag ausblenden (mit Begruendung, Autor wird benachrichtigt) oder wieder einblenden; protokolliert. */
  async moderatePost(user: PublicUser, postId: string, input: { action: "hide"; reason: string } | { action: "unhide" }): Promise<void> {
    const post = await this.orgPost(user, postId);
    const now = new Date();
    if (input.action === "unhide") {
      await this.db.update(posts).set({ hiddenAt: null, hiddenReason: null }).where(eq(posts.id, postId));
      await this.audit.record(user.id, "post.unhidden", { postId, orgId: post.orgId });
      return;
    }
    await this.db.transaction(async (tx) => {
      await tx.update(posts).set({ hiddenAt: now, hiddenReason: input.reason }).where(eq(posts.id, postId));
      await tx
        .update(reports)
        .set({ status: "actioned", resolvedBy: user.id, resolvedAt: now, resolution: input.reason })
        .where(and(eq(reports.postId, postId), eq(reports.status, "open")));
    });
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, post.orgId!)).limit(1);
    await this.audit.record(user.id, "post.hidden", { postId, orgId: post.orgId });
    await this.notifications.notify([post.authorId], "post_hidden", { orgName: org?.name ?? "", reason: input.reason, excerpt: post.body.slice(0, 80) });
  }

  /** Letzte Kommentare unter Vereinsbeitraegen. */
  async comments(user: PublicUser, slug: string): Promise<ModerationCommentItem[]> {
    const org = await this.orgs.requireBySlug(slug);
    await this.requireModerator(org.id, user.id);
    const rows = await this.db
      .select({ id: comments.id, body: comments.body, authorId: comments.authorId, createdAt: comments.createdAt, postId: posts.id, postBody: posts.body })
      .from(comments)
      .innerJoin(posts, eq(posts.id, comments.postId))
      .where(and(eq(posts.orgId, org.id), isNull(posts.deletedAt)))
      .orderBy(desc(comments.createdAt))
      .limit(50);
    const names = await this.directory.names(rows.map((r) => r.authorId));
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      authorName: names.get(r.authorId) ?? "Gelöschter Nutzer",
      createdAt: r.createdAt.toISOString(),
      postId: r.postId,
      postExcerpt: r.postBody.slice(0, 80),
    }));
  }

  async deleteComment(user: PublicUser, commentId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: comments.id, orgId: posts.orgId, postId: posts.id })
      .from(comments)
      .innerJoin(posts, eq(posts.id, comments.postId))
      .where(eq(comments.id, commentId))
      .limit(1);
    if (!row || !row.orgId) throw new NotFoundException("Kommentar nicht gefunden.");
    await this.requireModerator(row.orgId, user.id);
    await this.db.delete(comments).where(eq(comments.id, commentId));
    await this.audit.record(user.id, "comment.deleted", { commentId, postId: row.postId, orgId: row.orgId }); // ohne Inhalt
  }

  private async apply(actorId: string, report: typeof reports.$inferSelect, input: ResolveReportInput): Promise<void> {
    const reportId = report.id;
    const now = new Date();

    if (input.action === "dismiss") {
      await this.db
        .update(reports)
        .set({ status: "dismissed", resolvedBy: actorId, resolvedAt: now })
        .where(eq(reports.id, reportId));
      return;
    }

    const [post] = await this.db.select().from(posts).where(eq(posts.id, report.postId)).limit(1);
    const [org] = report.orgId
      ? await this.db.select().from(organizations).where(eq(organizations.id, report.orgId)).limit(1)
      : [];
    await this.db.transaction(async (tx) => {
      await tx.update(posts).set({ hiddenAt: now, hiddenReason: input.reason }).where(eq(posts.id, report.postId));
      await tx
        .update(reports)
        .set({ status: "actioned", resolvedBy: actorId, resolvedAt: now, resolution: input.reason })
        .where(and(eq(reports.postId, report.postId), eq(reports.status, "open")));
    });
    // DSA: Betroffene erfahren die Entscheidung samt Begruendung.
    if (post) {
      await this.notifications.notify([post.authorId], "post_hidden", {
        orgName: org?.name ?? "",
        reason: input.reason,
        excerpt: post.body.slice(0, 80),
      });
    }
  }
}
