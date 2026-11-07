import { Body, Controller, Get, HttpCode, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { markNotificationsReadSchema, notificationsQuerySchema, type NotificationsResponse, type PublicUser } from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly service: NotificationsService) {}

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
