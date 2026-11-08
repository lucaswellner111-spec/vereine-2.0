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
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  cancelEventSchema,
  createEventSchema,
  createShiftSchema,
  createTeamSchema,
  rsvpSchema,
  saveAttendanceSchema,
  updateEventSchema,
  updateShiftSchema,
  type AttendanceList,
  type EventItem,
  type PublicUser,
  type RsvpItem,
  type EventAttendees,
  type ShiftItem,
  type TeamItem,
  type TeamMemberItem,
} from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { AttendanceService } from "./attendance.service";
import { EventsService, type EventRange } from "./events.service";
import { ShiftsService } from "./shifts.service";
import { TeamsService } from "./teams.service";

type RangeQuery = { from?: string; to?: string; past?: string; before?: string };
/** Kalender-Parameter: from/to, past=1 (vergangene, absteigend), before = ID des letzten Termins (naechste Seite, mit to). */
const range = (q: RangeQuery): EventRange => ({ from: q.from, to: q.to, past: q.past === "1", before: q.before });

@Controller()
@UseGuards(SessionGuard)
export class EventsController {
  constructor(
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(TeamsService) private readonly teams: TeamsService,
    @Inject(ShiftsService) private readonly shifts: ShiftsService,
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
  ) {}

  // --- Termine ---
  @Get("events")
  mine(@CurrentUser() user: PublicUser, @Query() q: RangeQuery): Promise<EventItem[]> {
    return this.events.listMine(user, range(q));
  }

  @Get("orgs/:slug/events")
  forOrg(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Query() q: RangeQuery): Promise<EventItem[]> {
    return this.events.listForOrg(user, slug, range(q));
  }

  @Post("orgs/:slug/events")
  create(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Body() body: unknown): Promise<EventItem> {
    return this.events.create(user, slug, parse(createEventSchema, body));
  }

  @Get("events/:id")
  one(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<EventItem> {
    return this.events.get(user, id);
  }

  @Put("events/:id")
  update(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<EventItem> {
    return this.events.update(user, id, parse(updateEventSchema, body));
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

  @Get("events/:id/attendees")
  attendees(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<EventAttendees> {
    return this.events.attendees(user, id);
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

  // --- Helferlisten ---
  @Get("events/:id/shifts")
  shiftList(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<ShiftItem[]> {
    return this.shifts.list(user, id);
  }

  @Post("events/:id/shifts")
  shiftCreate(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<ShiftItem[]> {
    return this.shifts.create(user, id, parse(createShiftSchema, body));
  }

  @Patch("shifts/:id")
  shiftUpdate(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<ShiftItem[]> {
    return this.shifts.update(user, id, parse(updateShiftSchema, body));
  }

  @Delete("shifts/:id")
  @HttpCode(204)
  shiftDelete(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.shifts.remove(user, id);
  }

  @Put("shifts/:id/signup")
  shiftSignup(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<ShiftItem[]> {
    return this.shifts.signup(user, id);
  }

  @Delete("shifts/:id/signup")
  shiftLeave(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<ShiftItem[]> {
    return this.shifts.leave(user, id);
  }

  @Delete("shifts/:id/signups/:userId")
  @HttpCode(204)
  shiftRemoveSignup(
    @CurrentUser() user: PublicUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.shifts.removeSignup(user, id, userId);
  }

  // --- Anwesenheit ---
  @Get("events/:id/attendance")
  attendanceList(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<AttendanceList> {
    return this.attendance.list(user, id);
  }

  @Put("events/:id/attendance")
  attendanceSave(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<AttendanceList> {
    return this.attendance.save(user, id, parse(saveAttendanceSchema, body));
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
