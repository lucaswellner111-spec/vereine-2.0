import { BadRequestException, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, PayloadTooLargeException, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { MEMBER_IMPORT_LIMITS, type MemberImportPreview, type MemberImportResult, type PendingMemberPage, type PublicUser } from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { MemberImportService } from "./member-import.service";

/** CSV per multipart (Feld "file"), hoechstens 1 MB. Inhalt prueft der Dienst (Zeilen mit Zod aus @vereine/shared). */
async function readCsv(req: FastifyRequest): Promise<Buffer> {
  if (!req.isMultipart()) throw new BadRequestException("Erwartet multipart/form-data mit einer CSV-Datei.");
  const file = await req.file({ limits: { fileSize: MEMBER_IMPORT_LIMITS.maxBytes, files: 1 } });
  if (!file) throw new BadRequestException("Keine Datei erhalten.");
  let data: Buffer;
  try {
    data = await file.toBuffer();
  } catch {
    throw new PayloadTooLargeException("Die Datei ist größer als 1 MB.");
  }
  if (file.file.truncated) throw new PayloadTooLargeException("Die Datei ist größer als 1 MB.");
  return data;
}

@Controller("orgs/:slug/member-imports")
@UseGuards(SessionGuard)
export class MemberImportController {
  constructor(@Inject(MemberImportService) private readonly imports: MemberImportService) {}

  /** Stufe 1: pruefen, nichts speichern. */
  @Post("preview")
  @HttpCode(200)
  async preview(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Req() req: FastifyRequest): Promise<MemberImportPreview> {
    return this.imports.preview(user, slug, await readCsv(req));
  }

  /** Stufe 2: dieselbe Datei erneut pruefen, gueltige Zeilen vormerken, Einladungen als Job verschicken. */
  @Post()
  async confirm(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Req() req: FastifyRequest): Promise<MemberImportResult> {
    return this.imports.confirm(user, slug, await readCsv(req));
  }

  @Get("pending")
  pending(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Query("limit") limit?: string, @Query("offset") offset?: string): Promise<PendingMemberPage> {
    return this.imports.listPending(user, slug, { limit: limit ? Number(limit) || undefined : undefined, offset: offset ? Number(offset) || undefined : undefined });
  }

  @Delete("pending/:id")
  @HttpCode(204)
  remove(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.imports.removePending(user, slug, id);
  }
}
