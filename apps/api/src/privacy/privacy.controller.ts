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
import { CACHE, type Cache } from "../cache/cache.module";
import { parse } from "../common/parse";
import { enforceLimit } from "../common/rate-limit";
import { MediaService } from "../media/media.service";
import { PrivacyService } from "./privacy.service";

@Controller("privacy")
@UseGuards(SessionGuard)
export class PrivacyController {
  constructor(
    @Inject(PrivacyService) private readonly privacy: PrivacyService,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(CACHE) private readonly cache: Cache,
  ) {}

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
    // Teure Abfrage ueber alle Bereiche: hoechstens 5 je Stunde und Konto
    await enforceLimit(this.cache, `privacy:export:${user.id}`, 5, 3600, "Du hast deine Daten gerade erst exportiert. Bitte versuche es in einer Stunde erneut.");
    reply.header("Content-Disposition", 'attachment; filename="meine-daten.json"');
    return this.privacy.exportData(user);
  }

  /** Eigene Bilder als ZIP (Art. 20), streamend; hoechstens 5 Downloads je Stunde (Last auf Speicher/Netz). */
  @Get("export/media.zip")
  async exportMedia(@CurrentUser() user: PublicUser, @Res() reply: FastifyReply) {
    await enforceLimit(this.cache, `privacy:media-zip:${user.id}`, 5, 3600, "Du hast deine Bilder gerade erst heruntergeladen. Bitte versuche es in einer Stunde erneut.");
    const { stream } = await this.media.zipFor(user.id);
    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", 'attachment; filename="meine-bilder.zip"')
      .header("Cache-Control", "no-store")
      .send(stream);
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
