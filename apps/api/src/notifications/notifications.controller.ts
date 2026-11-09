import { Body, Controller, Get, HttpCode, Inject, Post, Put, Query, UseGuards } from "@nestjs/common";
import { emailPrefsSchema, markNotificationsReadSchema, notificationsQuerySchema, type EmailPrefs, type NotificationsResponse, type PublicUser } from "@vereine/shared";
import { DigestService } from "./digest.service";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly service: NotificationsService,
    @Inject(DigestService) private readonly digest: DigestService,
  ) {}

  /** Taegliche Sammelmail (Opt-in). */
  @Get("email-prefs")
  emailPrefs(@CurrentUser() user: PublicUser): Promise<EmailPrefs> {
    return this.digest.prefs(user);
  }

  @Put("email-prefs")
  setEmailPrefs(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<EmailPrefs> {
    return this.digest.setPrefs(user, parse(emailPrefsSchema, body).digest);
  }

  @Get()
  list(@CurrentUser() user: PublicUser, @Query() query: unknown): Promise<NotificationsResponse> {
    const { limit, cursor } = parse(notificationsQuerySchema, query ?? {});
    const n = Math.min(Math.max(Number(limit) || 30, 1), 100);
    return this.service.list(user.id, n, cursor);
  }

  @Post("read")
  @HttpCode(204)
  read(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<void> {
    return this.service.markRead(user.id, parse(markNotificationsReadSchema, body ?? {}).ids);
  }
}
