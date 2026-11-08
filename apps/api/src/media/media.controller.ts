import { BadRequestException, Controller, Delete, Get, Header, HttpCode, Inject, NotFoundException, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { MediaRef, PublicUser } from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { MediaService, type OrgImageKind } from "./media.service";

const orgKind = (k: string): OrgImageKind => {
  if (k !== "logo" && k !== "banner") throw new NotFoundException("Nicht gefunden.");
  return k;
};

async function readFile(req: FastifyRequest): Promise<Buffer> {
  if (!req.isMultipart()) throw new BadRequestException("Erwartet multipart/form-data mit einem Bild.");
  const file = await req.file();
  if (!file) throw new BadRequestException("Keine Datei erhalten.");
  const data = await file.toBuffer(); // wirft bei Ueberschreitung des Limits
  if (file.file.truncated) throw new BadRequestException("Bild ist groesser als 8 MB.");
  return data;
}

@Controller("media")
@UseGuards(SessionGuard)
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @Post("post")
  async uploadPost(@CurrentUser() user: PublicUser, @Req() req: FastifyRequest): Promise<MediaRef> {
    return this.media.uploadPostImage(user, await readFile(req));
  }

  @Post("avatar")
  async uploadAvatar(@CurrentUser() user: PublicUser, @Req() req: FastifyRequest): Promise<MediaRef> {
    return this.media.setAvatar(user, await readFile(req));
  }

  @Delete("avatar")
  @HttpCode(204)
  removeAvatar(@CurrentUser() user: PublicUser): Promise<void> {
    return this.media.removeAvatar(user);
  }

  /** Vereinslogo oder -banner (nur Vorstand). */
  @Post("org/:slug/:kind")
  async uploadOrgImage(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Param("kind") kind: string, @Req() req: FastifyRequest): Promise<MediaRef> {
    const k = orgKind(kind);
    return this.media.setOrgImage(user, slug, k, await readFile(req));
  }

  @Delete("org/:slug/:kind")
  @HttpCode(204)
  removeOrgImage(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Param("kind") kind: string): Promise<void> {
    return this.media.removeOrgImage(user, slug, orgKind(kind));
  }

  /** Bild ausliefern. Inhalt ist unveraenderlich (ID = Zufall), daher lange Cache-Zeit, aber nur privat im Browser. */
  @Get(":id/:variant")
  @Header("Cache-Control", "private, max-age=86400, immutable")
  @Header("X-Content-Type-Options", "nosniff")
  @Header("Content-Type", "image/webp")
  async serve(
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Param("variant") variant: string,
    @Res({ passthrough: true }) _reply: FastifyReply,
  ): Promise<Buffer> {
    if (!/^[0-9a-f-]{36}$/.test(id) || !/^[a-z-]{3,12}$/.test(variant)) throw new BadRequestException("Ungueltige Anfrage.");
    return this.media.serve(user, id, variant);
  }
}
