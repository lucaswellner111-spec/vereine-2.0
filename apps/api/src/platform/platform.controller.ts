import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import {
  resolveChatReportSchema,
  resolveReportSchema,
  type ChatReportItem,
  type PublicUser,
  type ReportItem,
} from "@vereine/shared";
import { CurrentUser, PlatformAdminGuard } from "../auth/session.guard";
import { ChatService } from "../chat/chat.service";
import { parse } from "../common/parse";
import { ModerationService } from "../posts/moderation.service";

const statusOf = (s?: string) => (s === "dismissed" || s === "actioned" ? s : "open");

/** Plattform-Moderation (DSA): Meldungen ohne Vereinszustaendigkeit und Chat-Meldungen. */
@Controller("platform")
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(
    @Inject(ModerationService) private readonly moderation: ModerationService,
    @Inject(ChatService) private readonly chat: ChatService,
  ) {}

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
