import { Module } from "@nestjs/common";
import { CaptchaController } from "./captcha.controller";
import { CaptchaGuard } from "./captcha.guard";
import { CaptchaService } from "./captcha.service";

/** Bot-Abwehr ohne Drittanbieter (Proof-of-Work). Module mit geschuetzten Routen importieren dieses Modul. */
@Module({
  controllers: [CaptchaController],
  providers: [CaptchaService, CaptchaGuard],
  exports: [CaptchaService, CaptchaGuard],
})
export class CaptchaModule {}
