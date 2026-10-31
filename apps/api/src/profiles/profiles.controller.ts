import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  followDecisionSchema,
  handleSchema,
  updateProfileSchema,
  type FollowRequest,
  type PersonItem,
  type ProfileView,
  type PublicUser,
} from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { ProfilesService } from "./profiles.service";

@Controller("profiles")
@UseGuards(SessionGuard)
export class ProfilesController {
  constructor(@Inject(ProfilesService) private readonly profiles: ProfilesService) {}

  // Feste Pfade vor ":handle"
  @Get("me")
  me(@CurrentUser() user: PublicUser): Promise<ProfileView> {
    return this.profiles.me(user);
  }

  @Put("me")
  update(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<ProfileView> {
    return this.profiles.update(user, parse(updateProfileSchema, body));
  }

  @Get("search")
  search(@CurrentUser() user: PublicUser, @Query("q") q = ""): Promise<PersonItem[]> {
    return this.profiles.search(user, q.slice(0, 50));
  }

  @Get("requests")
  requests(@CurrentUser() user: PublicUser): Promise<FollowRequest[]> {
    return this.profiles.requests(user);
  }

  @Post("requests/:userId/decision")
  @HttpCode(204)
  decide(@CurrentUser() user: PublicUser, @Param("userId", ParseUUIDPipe) userId: string, @Body() body: unknown): Promise<void> {
    return this.profiles.decide(user, userId, parse(followDecisionSchema, body).decision);
  }

  @Get(":handle")
  get(@CurrentUser() user: PublicUser, @Param("handle") handle: string): Promise<ProfileView> {
    return this.profiles.get(user, parse(handleSchema, handle));
  }

  @Post(":handle/follow")
  @HttpCode(200)
  follow(@CurrentUser() user: PublicUser, @Param("handle") handle: string): Promise<ProfileView> {
    return this.profiles.follow(user, parse(handleSchema, handle));
  }

  @Delete(":handle/follow")
  unfollow(@CurrentUser() user: PublicUser, @Param("handle") handle: string): Promise<ProfileView> {
    return this.profiles.unfollow(user, parse(handleSchema, handle));
  }

  @Get(":handle/followers")
  followers(@CurrentUser() user: PublicUser, @Param("handle") handle: string, @Query("offset") offset?: string): Promise<PersonItem[]> {
    return this.profiles.list(user, parse(handleSchema, handle), "followers", Number(offset) || 0);
  }

  @Get(":handle/following")
  following(@CurrentUser() user: PublicUser, @Param("handle") handle: string, @Query("offset") offset?: string): Promise<PersonItem[]> {
    return this.profiles.list(user, parse(handleSchema, handle), "following", Number(offset) || 0);
  }
}
