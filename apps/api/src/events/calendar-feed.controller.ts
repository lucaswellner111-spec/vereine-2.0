import { Controller, Delete, Get, Header, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import type { CalendarFeedCreated, CalendarFeedStatus, PublicUser } from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { CalendarFeedService } from "./calendar-feed.service";

@Controller()
export class CalendarFeedController {
  constructor(@Inject(CalendarFeedService) private readonly feed: CalendarFeedService) {}

  @Get("calendar-feed")
  @UseGuards(SessionGuard)
  status(@CurrentUser() user: PublicUser): Promise<CalendarFeedStatus> {
    return this.feed.status(user.id);
  }

  @Post("calendar-feed")
  @UseGuards(SessionGuard)
  rotate(@CurrentUser() user: PublicUser): Promise<CalendarFeedCreated> {
    return this.feed.rotate(user.id);
  }

  @Delete("calendar-feed")
  @UseGuards(SessionGuard)
  @HttpCode(204)
  disable(@CurrentUser() user: PublicUser): Promise<void> {
    return this.feed.disable(user.id);
  }

  /** Oeffentlich (ohne Sitzung), aber nur mit dem geheimen Token. Nicht fuer Suchmaschinen gedacht. */
  @Get("calendar/:token")
  @Header("Content-Type", "text/calendar; charset=utf-8")
  @Header("Cache-Control", "private, max-age=900")
  @Header("X-Robots-Tag", "noindex")
  @Header("Referrer-Policy", "no-referrer")
  one(@Param("token") token: string): Promise<string> {
    return this.feed.feed(token.replace(/\.ics$/, ""));
  }
}
