import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  createOrgSchema,
  decisionSchema,
  setRoleSchema,
  type MemberItem,
  type OrgDetail,
  type OrgSummary,
  type PublicUser,
} from "@vereine/shared";
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

  @Get(":slug/members")
  members(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Query("status") status?: string,
  ): Promise<MemberItem[]> {
    return this.orgs.members(slug, user, status === "pending" || status === "active" ? status : undefined);
  }

  @Post(":slug/members/:userId/decision")
  @HttpCode(204)
  decide(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() body: unknown,
  ): Promise<void> {
    return this.orgs.decide(slug, user, userId, parse(decisionSchema, body).decision);
  }

  @Put(":slug/members/:userId/role")
  @HttpCode(204)
  setRole(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() body: unknown,
  ): Promise<void> {
    return this.orgs.setRole(slug, user, userId, parse(setRoleSchema, body).role);
  }

  @Delete(":slug/members/:userId")
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.orgs.removeMember(slug, user, userId);
  }

  @Post(":slug/membership")
  requestMembership(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<OrgDetail> {
    return this.orgs.requestMembership(slug, user.id);
  }
}
