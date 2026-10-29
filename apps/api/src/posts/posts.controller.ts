import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import {
  createCommentSchema,
  createPostSchema,
  reportSchema,
  type CommentItem,
  type FeedPost,
  type FeedResponse,
  type PublicUser,
} from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { PostsService } from "./posts.service";

@Controller()
@UseGuards(SessionGuard)
export class PostsController {
  constructor(@Inject(PostsService) private readonly posts: PostsService) {}

  @Get("feed")
  feed(@CurrentUser() user: PublicUser, @Query("mode") mode?: string): Promise<FeedResponse> {
    return this.posts.feed(user, mode === "chrono" ? "chrono" : "ranked");
  }

  @Get("orgs/:slug/posts")
  orgPosts(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<FeedPost[]> {
    return this.posts.orgFeed(user, slug);
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
  comments(@Param("id", ParseUUIDPipe) id: string): Promise<CommentItem[]> {
    return this.posts.listComments(id);
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
