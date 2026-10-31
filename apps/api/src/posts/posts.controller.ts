import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import {
  createCommentSchema,
  createPostSchema,
  feedbackSchema,
  type MutedItem,
  reportSchema,
  resolveReportSchema,
  type ReportItem,
  type CommentItem,
  type FeedPost,
  type FeedResponse,
  type PublicUser,
} from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { ModerationService } from "./moderation.service";
import { PostsService } from "./posts.service";

@Controller()
@UseGuards(SessionGuard)
export class PostsController {
  constructor(
    @Inject(PostsService) private readonly posts: PostsService,
    @Inject(ModerationService) private readonly moderation: ModerationService,
  ) {}

  @Get("feed")
  feed(
    @CurrentUser() user: PublicUser,
    @Query("mode") mode?: string,
    @Query("cursor") cursor?: string,
  ): Promise<FeedResponse> {
    return this.posts.feed(user, mode === "chrono" ? "chrono" : "ranked", cursor);
  }

  @Get("orgs/:slug/posts")
  orgPosts(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Query("cursor") cursor?: string,
  ): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
    return this.posts.orgFeed(user, slug, cursor);
  }

  @Get("orgs/:slug/reports")
  reports(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Query("status") status?: string,
  ): Promise<ReportItem[]> {
    return this.moderation.list(user, slug, status === "dismissed" || status === "actioned" ? status : "open");
  }

  @Post("reports/:id/resolve")
  @HttpCode(204)
  resolve(
    @CurrentUser() user: PublicUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<void> {
    return this.moderation.resolve(user, id, parse(resolveReportSchema, body));
  }

  @Get("profiles/:handle/posts")
  userPosts(
    @CurrentUser() user: PublicUser,
    @Param("handle") handle: string,
    @Query("cursor") cursor?: string,
  ): Promise<{ posts: FeedPost[]; nextCursor: string | null; locked: boolean }> {
    return this.posts.userPosts(user, handle.toLowerCase(), cursor);
  }

  @Post("posts/:id/feedback")
  @HttpCode(204)
  feedback(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<void> {
    return this.posts.feedback(user, id, parse(feedbackSchema, body).kind);
  }

  @Get("feed/muted")
  muted(@CurrentUser() user: PublicUser): Promise<MutedItem[]> {
    return this.posts.muted(user);
  }

  @Delete("feed/muted/:kind/:id")
  @HttpCode(204)
  unmute(@CurrentUser() user: PublicUser, @Param("kind") kind: string, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.posts.unmute(user, kind === "post" || kind === "user" || kind === "org" ? kind : "post", id);
  }

  @Post("posts")
  create(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<FeedPost> {
    return this.posts.create(user, parse(createPostSchema, body));
  }

  @Delete("posts/:id")
  @HttpCode(204)
  remove(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.posts.remove(user, id);
  }

  @Post("posts/:id/like")
  @HttpCode(200)
  like(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.posts.toggleLike(user, id);
  }

  @Get("posts/:id/comments")
  comments(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<CommentItem[]> {
    return this.posts.listComments(user, id);
  }

  @Post("posts/:id/comments")
  addComment(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<CommentItem> {
    return this.posts.addComment(user, id, parse(createCommentSchema, body).body);
  }

  @Post("posts/:id/report")
  @HttpCode(204)
  report(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<void> {
    return this.posts.report(user, id, parse(reportSchema, body));
  }
}
