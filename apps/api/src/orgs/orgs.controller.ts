import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { createOrgSchema, type OrgDetail, type OrgSummary, type PublicUser } from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { OrgsService } from "./orgs.service";

@Controller("orgs")
@UseGuards(SessionGuard)
export class OrgsController {
  constructor(@Inject(OrgsService) private readonly orgs: OrgsService) {}

  @Get()
  list(@CurrentUser() user: PublicUser, @Query("q") q?: string): Promise<OrgSummary[]> {
    return this.orgs.list(user.id, q);
  }

  @Get("mine")
  mine(@CurrentUser() user: PublicUser): Promise<OrgSummary[]> {
    return this.orgs.publishable(user.id);
  }

  @Post()
  create(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<OrgDetail> {
    return this.orgs.create(user, parse(createOrgSchema, body));
  }

  @Get(":slug")
  detail(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<OrgDetail> {
    return this.orgs.detail(slug, user.id);
  }

  @Post(":slug/follow")
  @HttpCode(200)
  follow(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<OrgDetail> {
    return this.orgs.follow(slug, user.id, true);
  }

  @Delete(":slug/follow")
  unfollow(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<OrgDetail> {
    return this.orgs.follow(slug, user.id, false);
  }

  @Post(":slug/membership")
  requestMembership(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<OrgDetail> {
    return this.orgs.requestMembership(slug, user.id);
  }
}
