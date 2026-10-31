import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { PublicUser, ReportItem, ResolveReportInput } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { AuditService } from "../auth/audit.service";
import { UsersDirectory } from "../auth/users-directory.service";
import { organizations, posts, reports } from "../db/schema";
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
