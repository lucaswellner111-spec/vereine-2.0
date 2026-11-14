import { Body, Controller, ForbiddenException, Get, Header, HttpCode, Inject, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { avvAcceptSchema, avvToMarkdown, type AvvStatus, type PublicUser } from "@vereine/shared";
import { CurrentUser, requireVerifiedEmail, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { OrgsService } from "../orgs/orgs.service";
import { AvvService } from "./avv.service";

/** Vertrag zur Auftragsverarbeitung eines Vereins: Status und Download (Vorstand/Kassenwart), Zustimmung (nur Vorstand). */
@Controller("orgs/:slug/avv")
@UseGuards(SessionGuard)
export class AvvController {
  constructor(
    @Inject(AvvService) private readonly avv: AvvService,
    @Inject(OrgsService) private readonly orgs: OrgsService,
  ) {}

  private async org(user: PublicUser, slug: string, allowed: string[]) {
    const org = await this.orgs.requireBySlug(slug);
    const role = await this.orgs.activeRole(org.id, user.id);
    if (!role || !allowed.includes(role)) {
      throw new ForbiddenException(allowed.length === 1 ? "Nur der Vorstand stimmt dem Vertrag zu." : "Nur Vorstand und Kassenwart sehen den Vertrag.");
    }
    return { org, role };
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  async status(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<AvvStatus> {
    const { org, role } = await this.org(user, slug, ["admin", "treasurer"]);
    return this.avv.status(org.id, role === "admin");
  }

  @Post("accept")
  @HttpCode(200)
  async accept(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Body() body: unknown): Promise<AvvStatus> {
    requireVerifiedEmail(user);
    const { org } = await this.org(user, slug, ["admin"]);
    await this.avv.accept(org.id, user.id, parse(avvAcceptSchema, body));
    return this.avv.status(org.id, true);
  }

  /** Text der zuletzt akzeptierten (sonst der aktuellen) Fassung als Markdown-Datei; `?version=` waehlt eine bestimmte. */
  @Get("document")
  @Header("Content-Type", "text/markdown; charset=utf-8")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async document(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Query("version") version?: string,
  ): Promise<string> {
    const { org } = await this.org(user, slug, ["admin", "treasurer"]);
    const { doc, hash } = await this.avv.document(org.id, version);
    reply.header("Content-Disposition", `attachment; filename="avv-${doc.version}.md"`);
    reply.header("X-Text-Hash", hash);
    return avvToMarkdown(doc);
  }
}
