import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  cancelEventSchema,
  createEventSchema,
  createTeamSchema,
  rsvpSchema,
  type EventItem,
  type PublicUser,
  type RsvpItem,
  type TeamItem,
  type TeamMemberItem,
} from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { EventsService } from "./events.service";
import { TeamsService } from "./teams.service";

@Controller()
@UseGuards(SessionGuard)
export class EventsController {
  constructor(
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(TeamsService) private readonly teams: TeamsService,
  ) {}

  // --- Termine ---
  @Get("events")
  mine(@CurrentUser() user: PublicUser, @Query("from") from?: string, @Query("to") to?: string): Promise<EventItem[]> {
    return this.events.listMine(user, { from, to });
  }

  @Get("orgs/:slug/events")
  forOrg(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<EventItem[]> {
    return this.events.listForOrg(user, slug, { from, to });
  }

  @Post("orgs/:slug/events")
  create(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Body() body: unknown): Promise<EventItem> {
    return this.events.create(user, slug, parse(createEventSchema, body));
  }

  @Get("events/:id")
  one(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<EventItem> {
    return this.events.get(user, id);
  }

  @Get("events/:id/ics")
  @Header("Content-Type", "text/calendar; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="termin.ics"')
  ics(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<string> {
    return this.events.ics(user, id);
  }

  @Put("events/:id/rsvp")
  rsvp(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<EventItem> {
    return this.events.rsvp(user, id, parse(rsvpSchema, body).status);
  }

  @Get("events/:id/participants")
  participants(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<RsvpItem[]> {
    return this.events.participants(user, id);
  }

  @Post("events/:id/cancel")
  @HttpCode(204)
  cancel(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<void> {
    return this.events.cancel(user, id, parse(cancelEventSchema, body ?? {}).scope);
  }

  // --- Teams ---
  @Get("orgs/:slug/teams")
  teamList(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<TeamItem[]> {
    return this.teams.list(user, slug);
  }

  @Post("orgs/:slug/teams")
  teamCreate(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Body() body: unknown): Promise<TeamItem> {
    return this.teams.create(user, slug, parse(createTeamSchema, body));
  }

  @Delete("orgs/:slug/teams/:teamId")
  @HttpCode(204)
  teamDelete(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Param("teamId", ParseUUIDPipe) teamId: string,
  ): Promise<void> {
    return this.teams.remove(user, slug, teamId);
  }

  @Get("orgs/:slug/teams/:teamId/members")
  teamMembers(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Param("teamId", ParseUUIDPipe) teamId: string,
  ): Promise<TeamMemberItem[]> {
    return this.teams.members(user, slug, teamId);
  }

  @Put("orgs/:slug/teams/:teamId/members/:userId")
  @HttpCode(204)
  teamAdd(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Param("teamId", ParseUUIDPipe) teamId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.teams.addMember(user, slug, teamId, userId);
  }

  @Delete("orgs/:slug/teams/:teamId/members/:userId")
  @HttpCode(204)
  teamRemove(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Param("teamId", ParseUUIDPipe) teamId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.teams.removeMember(user, slug, teamId, userId);
  }
}
