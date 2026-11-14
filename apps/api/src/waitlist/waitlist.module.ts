import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { WaitlistController } from "./waitlist.controller";
import { WaitlistLinkRateLimitGuard, WaitlistSignupRateLimitGuard } from "./waitlist-rate-limit.guard";
import { WaitlistService } from "./waitlist.service";
import { CaptchaModule } from "../captcha/captcha.module";

/** Warteliste fuer Vereine (Schema `waitlist`, nur eigene Tabelle). Betreiber-Sicht im PlatformController. */
@Module({
  imports: [CaptchaModule, MailModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistSignupRateLimitGuard, WaitlistLinkRateLimitGuard],
  exports: [WaitlistService],
})
export class WaitlistModule {}
