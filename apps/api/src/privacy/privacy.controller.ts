import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Put,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import {
  deleteAccountSchema,
  setConsentSchema,
  type ConsentState,
  type PublicUser,
} from "@vereine/shared";
import { SESSION_COOKIE, CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { PrivacyService } from "./privacy.service";

@Controller("privacy")
@UseGuards(SessionGuard)
export class PrivacyController {
  constructor(@Inject(PrivacyService) private readonly privacy: PrivacyService) {}

  @Get("consents")
  consents(@CurrentUser() user: PublicUser): Promise<ConsentState[]> {
    return this.privacy.getConsents(user.id);
  }

  @Put("consents")
  setConsent(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<ConsentState[]> {
    return this.privacy.setConsent(user.id, parse(setConsentSchema, body));
  }

  @Get("export")
  async export(
    @CurrentUser() user: PublicUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header("Content-Disposition", 'attachment; filename="meine-daten.json"');
    return this.privacy.exportData(user);
  }

  @Delete("account")
  @HttpCode(204)
  async deleteAccount(
    @CurrentUser() user: PublicUser,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.privacy.deleteAccount(user, parse(deleteAccountSchema, body).password);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
  }
}
