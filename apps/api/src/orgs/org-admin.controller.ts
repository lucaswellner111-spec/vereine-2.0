import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import {
  createInviteSchema,
  orgBillingProfileSchema,
  type CreatedInvite,
  type InviteInfo,
  type InviteItem,
  type OrgBillingProfile,
  type PublicUser,
} from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { OrgAdminService } from "./org-admin.service";

@Controller()
@UseGuards(SessionGuard)
export class OrgAdminController {
  constructor(@Inject(OrgAdminService) private readonly admin: OrgAdminService) {}

  @Get("orgs/:slug/billing-profile")
  billingProfile(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<OrgBillingProfile> {
    return this.admin.billingProfile(user, slug);
  }

  @Put("orgs/:slug/billing-profile")
  setBillingProfile(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Body() body: unknown): Promise<OrgBillingProfile> {
    return this.admin.setBillingProfile(user, slug, parse(orgBillingProfileSchema, body));
  }

  @Get("orgs/:slug/invites")
  invites(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<InviteItem[]> {
    return this.admin.listInvites(user, slug);
  }

  @Post("orgs/:slug/invites")
  createInvite(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Body() body: unknown): Promise<CreatedInvite> {
    return this.admin.createInvite(user, slug, parse(createInviteSchema, body ?? {}));
  }

  @Delete("orgs/:slug/invites/:id")
  @HttpCode(204)
  revokeInvite(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.admin.revokeInvite(user, slug, id);
  }

  @Get("invites/:token")
  info(@CurrentUser() user: PublicUser, @Param("token") token: string): Promise<InviteInfo> {
    return this.admin.info(user, token);
  }

  @Post("invites/:token/accept")
  @HttpCode(200)
  accept(@CurrentUser() user: PublicUser, @Param("token") token: string): Promise<InviteInfo> {
    return this.admin.accept(user, token);
  }
}
