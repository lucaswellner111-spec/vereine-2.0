import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { feeRunSchema, type FeeRunItem, type FeeRunPreview, type PublicUser } from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { FeeRunsService } from "./fee-runs.service";

/** Beitragslauf (Vorstand/Kassenwart): Vorschau, Anlegen (Job), Liste, fehlgeschlagenen Lauf neu starten. */
@Controller("orgs/:slug/fee-runs")
@UseGuards(SessionGuard)
export class FeeRunsController {
  constructor(@Inject(FeeRunsService) private readonly runs: FeeRunsService) {}

  @Post("preview")
  @HttpCode(200)
  preview(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Body() body: unknown): Promise<FeeRunPreview> {
    return this.runs.preview(user, slug, parse(feeRunSchema, body));
  }

  @Post()
  create(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Body() body: unknown): Promise<FeeRunItem> {
    return this.runs.create(user, slug, parse(feeRunSchema, body));
  }

  @Post(":id/retry")
  @HttpCode(200)
  retry(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Param("id", ParseUUIDPipe) id: string): Promise<FeeRunItem> {
    return this.runs.retry(user, slug, id);
  }

  @Get()
  list(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<FeeRunItem[]> {
    return this.runs.list(user, slug);
  }
}
