import { BadRequestException, Controller, Get, Header, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { publicOrgQuerySchema, type PublicOrg, type PublicOrgSummary } from "@vereine/shared";
import { parse } from "../common/parse";
import { PublicMediaRateLimitGuard, PublicRateLimitGuard } from "./public-rate-limit.guard";
import { PublicService } from "./public.service";

/** Ohne Anmeldung (kein SessionGuard). Daten 60/min je IP, Bilder 600/min je IP (getrennte Zaehler). */
@Controller("public")
export class PublicController {
  constructor(@Inject(PublicService) private readonly pub: PublicService) {}

  /** Vereinsfinder: nur Vereine mit freigeschalteter oeffentlicher Seite, max. 30 je Seite. */
  @Get("orgs")
  @UseGuards(PublicRateLimitGuard)
  list(@Query() query: unknown): Promise<PublicOrgSummary[]> {
    return this.pub.list(parse(publicOrgQuerySchema, query ?? {}));
  }

  @Get("orgs/:slug")
  @UseGuards(PublicRateLimitGuard)
  org(@Param("slug") slug: string): Promise<PublicOrg> {
    return this.pub.org(slug.toLowerCase());
  }

  /** Logo/Banner oeffentlicher Vereine; unveraenderlich (ID = Zufall), daher oeffentlich cachebar. */
  @Get("media/:id/:variant")
  @UseGuards(PublicMediaRateLimitGuard)
  @Header("Cache-Control", "public, max-age=86400, immutable")
  @Header("X-Content-Type-Options", "nosniff")
  @Header("Content-Type", "image/webp")
  media(@Param("id") id: string, @Param("variant") variant: string): Promise<Buffer> {
    if (!/^[0-9a-f-]{36}$/.test(id) || !/^[a-z-]{3,12}$/.test(variant)) throw new BadRequestException("Ungueltige Anfrage.");
    return this.pub.media(id, variant);
  }
}
