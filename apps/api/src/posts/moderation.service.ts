import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { PublicUser, ReportItem, ResolveReportInput } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
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
  ) {}

  private async requireModerator(orgId: string, userId: string) {
    const role = await this.orgs.activeRole(orgId, userId);
    if (!role || !MODERATION_ROLES.includes(role)) throw new ForbiddenException("Nur Vorstand und Moderation.");
  }

  async list(user: PublicUser, slug: string, status = "open"): Promise<ReportItem[]> {
    const org = await this.orgs.requireBySlug(slug);
    await this.requireModerator(org.id, user.id);
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
      .where(and(eq(reports.orgId, org.id), eq(reports.status, status)))
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
    const now = new Date();

    if (input.action === "dismiss") {
      await this.db
        .update(reports)
        .set({ status: "dismissed", resolvedBy: user.id, resolvedAt: now })
        .where(eq(reports.id, reportId));
      return;
    }

    const [post] = await this.db.select().from(posts).where(eq(posts.id, report.postId)).limit(1);
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, report.orgId)).limit(1);
    await this.db.transaction(async (tx) => {
      await tx.update(posts).set({ hiddenAt: now, hiddenReason: input.reason }).where(eq(posts.id, report.postId));
      await tx
        .update(reports)
        .set({ status: "actioned", resolvedBy: user.id, resolvedAt: now, resolution: input.reason })
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
