import { BadRequestException, Body, Controller, HttpCode, Inject, Post, Query } from "@nestjs/common";
import { unsubscribeSchema } from "@vereine/shared";
import { parse } from "../common/parse";
import { MailService } from "./mail.service";

/**
 * Abmelden ohne Login. Zwei Wege auf denselben Endpunkt:
 * - Web-Seite /abmelden (Knopf, JSON `{ token }`)
 * - Ein-Klick aus dem Mailprogramm (RFC 8058): POST `?t=…` mit Formular-Body `List-Unsubscribe=One-Click`.
 * Bewusst kein GET, damit Link-Scanner in Postfaechern niemanden abmelden.
 */
@Controller("mail")
export class MailController {
  constructor(@Inject(MailService) private readonly mail: MailService) {}

  @Post("unsubscribe")
  @HttpCode(200)
  async unsubscribe(@Query("t") t: string | undefined, @Body() body: unknown): Promise<{ kind: "digest" | "invite" }> {
    const token = t ?? parse(unsubscribeSchema, body ?? {}).token;
    const res = await this.mail.unsubscribe(token);
    if (!res) throw new BadRequestException("Dieser Abmeldelink ist ungültig.");
    return res;
  }
}
