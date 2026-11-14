import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { deleteChildSchema, type DeleteChildResult, type PublicUser } from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { CACHE, type Cache } from "../cache/cache.module";
import { parse } from "../common/parse";
import { enforceLimit } from "../common/rate-limit";
import { PrivacyService } from "./privacy.service";

/** Auskunft und Loeschung eines Jugendkontos durch den Elternteil (nur eigene Kinder, sonst 404). */
@Controller("guardian/children")
@UseGuards(SessionGuard)
export class GuardianPrivacyController {
  constructor(
    @Inject(PrivacyService) private readonly privacy: PrivacyService,
    @Inject(CACHE) private readonly cache: Cache,
  ) {}

  @Get(":id/export")
  async export(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Res({ passthrough: true }) reply: FastifyReply) {
    await enforceLimit(this.cache, `privacy:export-child:${user.id}`, 5, 3600, "Du hast die Daten deines Kindes gerade erst exportiert. Bitte versuche es in einer Stunde erneut.");
    reply.header("Content-Disposition", 'attachment; filename="daten-meines-kindes.json"');
    return this.privacy.exportChild(user, id);
  }

  /** Ein Elternteil: sofort geloescht. Zwei Elternteile: Vorankuendigung (7 Tage), der andere kann widersprechen. */
  @Delete(":id")
  @HttpCode(200)
  async remove(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<DeleteChildResult> {
    await enforceLimit(this.cache, `privacy:delete-child:${user.id}`, 10, 3600, "Zu viele Versuche. Bitte versuche es später erneut.");
    return this.privacy.deleteChild(user, id, parse(deleteChildSchema, body).password);
  }
}
