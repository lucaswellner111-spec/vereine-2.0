import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  addMembersSchema,
  createConversationSchema,
  reportMessageSchema,
  sendMessageSchema,
  setRetentionSchema,
  type ChatContact,
  type ChatMessage,
  type ConversationDetail,
  type ConversationSummary,
  type MessagePage,
  type PublicUser,
} from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { ChatService } from "./chat.service";

@Controller("chat")
@UseGuards(SessionGuard)
export class ChatController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  @Get("contacts")
  contacts(@CurrentUser() user: PublicUser): Promise<ChatContact[]> {
    return this.chat.contacts(user);
  }

  @Get("unread")
  async unread(@CurrentUser() user: PublicUser): Promise<{ unread: number }> {
    return { unread: await this.chat.unreadTotal(user) };
  }

  @Get("conversations")
  list(@CurrentUser() user: PublicUser): Promise<ConversationSummary[]> {
    return this.chat.list(user);
  }

  @Post("conversations")
  create(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<ConversationDetail> {
    return this.chat.create(user, parse(createConversationSchema, body));
  }

  @Get("conversations/:id")
  detail(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<ConversationDetail> {
    return this.chat.detail(user, id);
  }

  @Get("conversations/:id/messages")
  messages(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Query("cursor") cursor?: string): Promise<MessagePage> {
    return this.chat.messages(user, id, cursor);
  }

  @Post("conversations/:id/messages")
  send(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<ChatMessage> {
    return this.chat.send(user, id, parse(sendMessageSchema, body).body);
  }

  @Post("conversations/:id/read")
  @HttpCode(204)
  read(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.chat.markRead(user, id);
  }

  @Put("conversations/:id/retention")
  retention(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<ConversationDetail> {
    return this.chat.setRetention(user, id, parse(setRetentionSchema, body).days);
  }

  @Post("conversations/:id/members")
  addMembers(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<ConversationDetail> {
    return this.chat.addMembers(user, id, parse(addMembersSchema, body).userIds);
  }

  @Delete("conversations/:id/members/:userId")
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: PublicUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.chat.removeMember(user, id, userId);
  }

  @Delete("messages/:id")
  @HttpCode(204)
  deleteMessage(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.chat.deleteMessage(user, id);
  }

  @Post("messages/:id/report")
  @HttpCode(204)
  report(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<void> {
    return this.chat.report(user, id, parse(reportMessageSchema, body));
  }

  @Get("blocks")
  blocks(@CurrentUser() user: PublicUser): Promise<{ userId: string; name: string }[]> {
    return this.chat.blocks(user);
  }

  @Put("blocks/:userId")
  @HttpCode(204)
  block(@CurrentUser() user: PublicUser, @Param("userId", ParseUUIDPipe) userId: string): Promise<void> {
    return this.chat.block(user, userId);
  }

  @Delete("blocks/:userId")
  @HttpCode(204)
  unblock(@CurrentUser() user: PublicUser, @Param("userId", ParseUUIDPipe) userId: string): Promise<void> {
    return this.chat.unblock(user, userId);
  }
}
