import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { pushSubscribeSchema, pushUnsubscribeSchema, type PrivatePushState, type PublicUser } from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { PushService } from "./push.service";

@Controller("push")
@UseGuards(SessionGuard)
export class PushController {
  constructor(@Inject(PushService) private readonly push: PushService) {}

  /** Oeffentlicher VAPID-Schluessel (null = Push auf diesem Server nicht eingerichtet) und Anzahl eigener Geraete. */
  @Get()
  async state(@CurrentUser() user: PublicUser): Promise<PrivatePushState> {
    return { publicKey: this.push.publicKey, devices: await this.push.count(user.id) };
  }

  @Post("subscribe")
  @HttpCode(204)
  subscribe(@CurrentUser() user: PublicUser, @Body() body: unknown, @Req() req: FastifyRequest): Promise<void> {
    const sub = parse(pushSubscribeSchema, body);
    return this.push.subscribe(user.id, { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, req.headers["user-agent"]);
  }

  @Delete("subscribe")
  @HttpCode(204)
  unsubscribe(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<void> {
    return this.push.unsubscribe(user.id, parse(pushUnsubscribeSchema, body).endpoint);
  }
}
