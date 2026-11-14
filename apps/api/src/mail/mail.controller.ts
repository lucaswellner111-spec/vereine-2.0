import { BadRequestException, Body, Controller, Headers, HttpCode, Inject, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { unsubscribeSchema } from "@vereine/shared";
import { parse } from "../common/parse";
import { BounceWebhookService, WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TIMESTAMP_HEADER } from "./bounce-webhook.service";
import { MailService } from "./mail.service";

/**
 * Abmelden ohne Login. Zwei Wege auf denselben Endpunkt:
 * - Web-Seite /abmelden (Knopf, JSON `{ token }`)
 * - Ein-Klick aus dem Mailprogramm (RFC 8058): POST `?t=…` mit Formular-Body `List-Unsubscribe=One-Click`.
 * Bewusst kein GET, damit Link-Scanner in Postfaechern niemanden abmelden.
 */
@Controller("mail")
export class MailController {
  constructor(
    @Inject(MailService) private readonly mail: MailService,
    @Inject(BounceWebhookService) private readonly webhook: BounceWebhookService,
  ) {}

  /**
   * Bounces/Beschwerden von Scaleway TEM (signiert, siehe BounceWebhookService). Der Rohkoerper kommt aus dem preParsing-Hook
   * in app.setup (nur fuer diese Route). Antwort ohne Details.
   */
  @Post("webhook/scaleway")
  @HttpCode(202)
  bounces(
    @Req() req: FastifyRequest & { rawBody?: Buffer },
    @Headers(WEBHOOK_TIMESTAMP_HEADER) timestamp?: string,
    @Headers(WEBHOOK_SIGNATURE_HEADER) signature?: string,
  ): Promise<{ accepted: number; ignored: number }> {
    return this.webhook.handle(req.rawBody, timestamp, signature);
  }

  @Post("unsubscribe")
  @HttpCode(200)
  async unsubscribe(@Query("t") t: string | undefined, @Body() body: unknown): Promise<{ kind: "digest" | "invite" | "waitlist" }> {
    const token = t ?? parse(unsubscribeSchema, body ?? {}).token;
    const res = await this.mail.unsubscribe(token);
    if (!res) throw new BadRequestException("Dieser Abmeldelink ist ungültig.");
    return res;
  }
}
