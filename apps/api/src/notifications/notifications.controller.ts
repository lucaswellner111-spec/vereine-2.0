import { Body, Controller, Get, HttpCode, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { NotificationsResponse, PublicUser } from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { NotificationsService } from "./notifications.service";

const markReadSchema = z.object({ ids: z.array(z.string().uuid()).max(100).optional() });

@Controller("notifications")
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly service: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: PublicUser, @Query("limit") limit?: string): Promise<NotificationsResponse> {
    const n = Math.min(Math.max(Number(limit) || 30, 1), 100);
    return this.service.list(user.id, n);
  }

  @Post("read")
  @HttpCode(204)
  read(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<void> {
    return this.service.markRead(user.id, parse(markReadSchema, body ?? {}).ids);
  }
}
