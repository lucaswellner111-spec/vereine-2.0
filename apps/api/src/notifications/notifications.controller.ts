import { Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { emailPrefsSchema, markNotificationsReadSchema, notificationsQuerySchema, type EmailPrefs, type NotificationItem, type NotificationsResponse, type PublicUser } from "@vereine/shared";
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

  /** Einzelne Benachrichtigung (fuer das Live-Banner). */
  @Get(":id")
  async one(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<NotificationItem> {
    const item = await this.service.get(user.id, id);
    if (!item) throw new NotFoundException("Benachrichtigung nicht gefunden.");
    return item;
  }

  /** Ausblenden = eigene Benachrichtigung loeschen. */
  @Delete(":id")
  @HttpCode(204)
  hide(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.service.remove(user.id, id);
  }

  @Post("read")
  @HttpCode(204)
  read(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<void> {
    return this.service.markRead(user.id, parse(markNotificationsReadSchema, body ?? {}).ids);
  }
}
