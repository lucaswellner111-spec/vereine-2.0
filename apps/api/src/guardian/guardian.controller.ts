import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import {
  acceptGuardianInviteSchema,
  createYouthSchema,
  inviteGuardianSchema,
  joinOrgForChildSchema,
  rsvpSchema,
  setBillingContactSchema,
  type GuardianInviteInfo,
  type PublicUser,
  type YouthChild,
  type YouthChildDetail,
  type YouthGuardiansView,
} from "@vereine/shared";
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

  // --- Zweiter Elternteil und Rechnungsempfaenger (E2) ---

  @Get(":id/guardians")
  guardians(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<YouthGuardiansView> {
    return this.guardian.guardiansView(user, id);
  }

  @Post(":id/guardians")
  @HttpCode(204)
  async invite(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<void> {
    requireVerifiedEmail(user);
    await this.guardian.inviteGuardian(user, id, parse(inviteGuardianSchema, body).email);
  }

  @Delete(":id/guardian-invites/:inviteId")
  @HttpCode(204)
  revokeInvite(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Param("inviteId", ParseUUIDPipe) inviteId: string): Promise<void> {
    return this.guardian.revokeGuardianInvite(user, id, inviteId);
  }

  @Put(":id/billing-contact")
  @HttpCode(204)
  billingContact(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<void> {
    return this.guardian.setBillingContact(user, id, parse(setBillingContactSchema, body).guardianId);
  }

  /** Widerspruch gegen die geplante Loeschung (jeder Elternteil). */
  @Delete(":id/deletion")
  @HttpCode(204)
  cancelDeletion(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.guardian.cancelDeletion(user, id);
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

/** Einladung als zweiter Elternteil annehmen: eigenes, bestaetigtes Erwachsenenkonto mit der eingeladenen Adresse. */
@Controller("guardian/invites")
@UseGuards(SessionGuard)
export class GuardianInviteController {
  constructor(@Inject(GuardianService) private readonly guardian: GuardianService) {}

  @Get(":token")
  info(@CurrentUser() user: PublicUser, @Param("token") token: string): Promise<GuardianInviteInfo> {
    return this.guardian.guardianInviteInfo(user, token);
  }

  @Post(":token/accept")
  @HttpCode(200)
  accept(@CurrentUser() user: PublicUser, @Param("token") token: string, @Body() body: unknown): Promise<{ childId: string }> {
    requireVerifiedEmail(user);
    parse(acceptGuardianInviteSchema, body);
    return this.guardian.acceptGuardianInvite(user, token);
  }
}
