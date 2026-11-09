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
  orgTagsSchema,
  setPublicPageSchema,
  setRoleSchema,
  updateOrgSchema,
  type MemberItem,
  type OrgDetail,
  type OrgMemberName,
  type OrgSummary,
  type PublicUser,
} from "@vereine/shared";
import { CurrentUser, requireVerifiedEmail, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { OrgsService } from "./orgs.service";

@Controller("orgs")
@UseGuards(SessionGuard)
export class OrgsController {
  constructor(@Inject(OrgsService) private readonly orgs: OrgsService) {}

  @Get()
  list(@CurrentUser() user: PublicUser, @Query("q") q?: string, @Query("tag") tag?: string, @Query("city") city?: string): Promise<OrgSummary[]> {
    return this.orgs.list(user.id, typeof q === "string" ? q : undefined, typeof tag === "string" ? tag : undefined, typeof city === "string" ? city : undefined);
  }

  @Get("mine")
  mine(@CurrentUser() user: PublicUser): Promise<OrgSummary[]> {
    return this.orgs.publishable(user.id);
  }

  /** Vereine mit Verwaltungsrolle (Vorstand, Kassenwart, Moderation) - fuer die Verwaltungsseite. */
  @Get("managed")
  managed(@CurrentUser() user: PublicUser): Promise<OrgSummary[]> {
    return this.orgs.managedBy(user.id);
  }

  @Post()
  create(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<OrgDetail> {
    requireVerifiedEmail(user);
    return this.orgs.create(user, parse(createOrgSchema, body));
  }

  @Get(":slug")
  detail(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<OrgDetail> {
    return this.orgs.detail(slug, user.id);
  }

  /** Vereinsprofil bearbeiten (nur Vorstand). */
  @Put(":slug")
  update(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Body() body: unknown): Promise<OrgDetail> {
    return this.orgs.update(slug, user, parse(updateOrgSchema, body));
  }

  /** Oeffentliche Vereinsseite /verein/<slug> ein-/ausschalten (nur Vorstand). */
  @Put(":slug/public-page")
  setPublicPage(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Body() body: unknown): Promise<OrgDetail> {
    return this.orgs.setPublicPage(slug, user, parse(setPublicPageSchema, body).enabled);
  }

  @Put(":slug/tags")
  setTags(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Body() body: unknown): Promise<OrgDetail> {
    return this.orgs.setTags(slug, user, parse(orgTagsSchema, body).tags);
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

  /** Nur Namen aktiver Mitglieder (Vorstand/Moderation), z. B. fuer neue Gruppen-Chats. */
  @Get(":slug/member-names")
  memberNames(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<OrgMemberName[]> {
    return this.orgs.memberNames(slug, user);
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
