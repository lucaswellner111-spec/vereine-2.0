import { Body, Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { WAITLIST_CHECK_INBOX, waitlistSignupSchema, waitlistTokenSchema } from "@vereine/shared";
import { parse } from "../common/parse";
import { WaitlistLinkRateLimitGuard, WaitlistSignupRateLimitGuard } from "./waitlist-rate-limit.guard";
import { WaitlistService } from "./waitlist.service";

/** Warteliste ohne Login (Startseite). Die Antwort auf die Anmeldung ist immer gleich. */
@Controller("waitlist")
export class WaitlistController {
  constructor(@Inject(WaitlistService) private readonly waitlist: WaitlistService) {}

  @Post()
  @HttpCode(202)
  @UseGuards(WaitlistSignupRateLimitGuard)
  async signup(@Body() body: unknown): Promise<{ message: string }> {
    await this.waitlist.signup(parse(waitlistSignupSchema, body));
    return { message: WAITLIST_CHECK_INBOX };
  }

  @Post("confirm")
  @HttpCode(204)
  @UseGuards(WaitlistLinkRateLimitGuard)
  confirm(@Body() body: unknown): Promise<void> {
    return this.waitlist.confirm(parse(waitlistTokenSchema, body).token);
  }

  @Post("remove")
  @HttpCode(204)
  @UseGuards(WaitlistLinkRateLimitGuard)
  remove(@Body() body: unknown): Promise<void> {
    return this.waitlist.remove(parse(waitlistTokenSchema, body).token);
  }
}
