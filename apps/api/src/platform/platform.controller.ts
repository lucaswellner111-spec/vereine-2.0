import { Body, Controller, Get, Header, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import {
  resolveChatReportSchema,
  resolveReportSchema,
  type ChatReportItem,
  type MailQuota,
  type PublicUser,
  type ReportItem,
  type WaitlistOverview,
} from "@vereine/shared";
import { AuditService } from "../auth/audit.service";
import { CurrentUser, PlatformAdminGuard } from "../auth/session.guard";
import { ChatService } from "../chat/chat.service";
import { parse } from "../common/parse";
import { MailService } from "../mail/mail.service";
import { ModerationService } from "../posts/moderation.service";
import { WaitlistService } from "../waitlist/waitlist.service";

const statusOf = (s?: string) => (s === "dismissed" || s === "actioned" ? s : "open");

/** Plattform-Moderation (DSA): Meldungen ohne Vereinszustaendigkeit und Chat-Meldungen. */
@Controller("platform")
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(
    @Inject(ModerationService) private readonly moderation: ModerationService,
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(WaitlistService) private readonly waitlist: WaitlistService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Warteliste: Zaehler und bestaetigte Eintraege (Adressen!), jeder Abruf wird protokolliert. */
  @Get("waitlist")
  async waitlistOverview(@CurrentUser() admin: PublicUser): Promise<WaitlistOverview> {
    const overview = await this.waitlist.overview();
    await this.audit.record(admin.id, "platform.waitlist.viewed", { count: overview.entries.length });
    return overview;
  }

  @Get("waitlist.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="warteliste.csv"')
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async waitlistCsv(@CurrentUser() admin: PublicUser): Promise<string> {
    const { csv, count } = await this.waitlist.exportCsv();
    await this.audit.record(admin.id, "platform.waitlist.exported", { count });
    return csv;
  }

  /** Mail-Kontingent fuer die Plattform-Seite ("Mail-Kontingent 82 %"). */
  @Get("mail-quota")
  async mailQuota(): Promise<MailQuota> {
    return { driver: this.mail.driverName, ...(await this.mail.quota()) };
  }

  @Get("reports")
  reports(@CurrentUser() admin: PublicUser, @Query("status") status?: string): Promise<ReportItem[]> {
    return this.moderation.listPlatform(admin, statusOf(status));
  }

  @Post("reports/:id/resolve")
  @HttpCode(204)
  resolve(@CurrentUser() admin: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<void> {
    return this.moderation.resolvePlatform(admin, id, parse(resolveReportSchema, body));
  }

  @Get("chat-reports")
  chatReports(@CurrentUser() admin: PublicUser, @Query("status") status?: string): Promise<ChatReportItem[]> {
    return this.chat.listReports(admin, statusOf(status));
  }

  @Post("chat-reports/:id/resolve")
  @HttpCode(204)
  resolveChat(@CurrentUser() admin: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<void> {
    return this.chat.resolveReport(admin, id, parse(resolveChatReportSchema, body));
  }
}
