import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  adminMemberProfileSchema,
  feeClassSchema,
  selfMemberProfileSchema,
  type FeeClassItem,
  type MemberRecord,
  type MemberRegistryPage,
  type MyMembership,
  type PublicUser,
} from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { MembersService } from "./members.service";

@Controller()
@UseGuards(SessionGuard)
export class MembersController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}

  @Get("orgs/:slug/member-registry")
  list(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Query("q") q?: string,
    @Query("feeClassId") feeClassId?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<MemberRegistryPage> {
    return this.members.list(user, slug, {
      q,
      feeClassId: feeClassId && /^[0-9a-f-]{36}$/i.test(feeClassId) ? feeClassId : undefined,
      limit: limit ? Number(limit) || undefined : undefined,
      offset: offset ? Number(offset) || undefined : undefined,
    });
  }

  @Get("orgs/:slug/member-registry.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="mitglieder.csv"')
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  csv(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<string> {
    return this.members.exportCsv(user, slug);
  }

  @Get("orgs/:slug/member-registry/:userId")
  one(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Param("userId", ParseUUIDPipe) userId: string): Promise<MemberRecord> {
    return this.members.get(user, slug, userId);
  }

  @Put("orgs/:slug/member-registry/:userId")
  update(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() body: unknown,
  ): Promise<MemberRecord> {
    return this.members.update(user, slug, userId, parse(adminMemberProfileSchema, body));
  }

  @Get("orgs/:slug/fee-classes")
  classes(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<FeeClassItem[]> {
    return this.members.listClasses(user, slug);
  }

  @Post("orgs/:slug/fee-classes")
  createClass(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Body() body: unknown): Promise<FeeClassItem[]> {
    return this.members.createClass(user, slug, parse(feeClassSchema, body));
  }

  @Put("orgs/:slug/fee-classes/:id")
  updateClass(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<FeeClassItem[]> {
    return this.members.updateClass(user, slug, id, parse(feeClassSchema, body));
  }

  @Delete("orgs/:slug/fee-classes/:id")
  @HttpCode(204)
  deleteClass(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.members.deleteClass(user, slug, id);
  }

  // --- eigene Daten (Selbstverwaltung) ---

  @Get("me/memberships")
  mine(@CurrentUser() user: PublicUser): Promise<MyMembership[]> {
    return this.members.myMemberships(user);
  }

  @Get("orgs/:slug/my-profile")
  myProfile(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<MyMembership> {
    return this.members.myProfile(user, slug);
  }

  @Put("orgs/:slug/my-profile")
  updateMine(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Body() body: unknown): Promise<MyMembership> {
    return this.members.updateMyProfile(user, slug, parse(selfMemberProfileSchema, body));
  }
}
