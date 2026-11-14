import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { createYouthSchema, joinOrgForChildSchema, rsvpSchema, type PublicUser, type YouthChild, type YouthChildDetail } from "@vereine/shared";
import { parse } from "../common/parse";
import { CurrentUser, requireVerifiedEmail, SessionGuard } from "../auth/session.guard";
import { GuardianService } from "./guardian.service";

/** Eltern verwalten ihre Kinder (Jugendkonten). Alle Routen: nur fuer angemeldete Erwachsenenkonten, nur fuer eigene Kinder. */
@Controller("guardian/children")
@UseGuards(SessionGuard)
export class GuardianController {
  constructor(@Inject(GuardianService) private readonly guardian: GuardianService) {}

  @Get()
  list(@CurrentUser() user: PublicUser): Promise<YouthChild[]> {
    return this.guardian.listChildren(user.id);
  }

  @Post()
  create(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<YouthChild> {
    requireVerifiedEmail(user);
    return this.guardian.create(user, parse(createYouthSchema, body));
  }

  @Get(":id")
  detail(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<YouthChildDetail> {
    return this.guardian.detail(user, id);
  }

  /** Verein beitreten: Einladungslink (sofort aktiv) oder Antrag per Vereinsadresse (der Vorstand bestaetigt). */
  @Post(":id/orgs")
  @HttpCode(200)
  join(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    requireVerifiedEmail(user);
    return this.guardian.join(user, id, parse(joinOrgForChildSchema, body));
  }

  @Delete(":id/orgs/:slug")
  @HttpCode(204)
  leave(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Param("slug") slug: string): Promise<void> {
    return this.guardian.leave(user, id, slug);
  }

  @Put(":id/events/:eventId/rsvp")
  async rsvp(
    @CurrentUser() user: PublicUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Body() body: unknown,
  ): Promise<{ status: YouthChildDetail["events"][number]["myStatus"] }> {
    return { status: await this.guardian.rsvp(user, id, eventId, parse(rsvpSchema, body).status) };
  }

  @Put(":id/shifts/:shiftId")
  @HttpCode(204)
  signup(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Param("shiftId", ParseUUIDPipe) shiftId: string): Promise<void> {
    return this.guardian.shiftSignup(user, id, shiftId);
  }

  @Delete(":id/shifts/:shiftId")
  @HttpCode(204)
  leaveShift(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Param("shiftId", ParseUUIDPipe) shiftId: string): Promise<void> {
    return this.guardian.shiftLeave(user, id, shiftId);
  }
}
