import { Module } from "@nestjs/common";
import { LazyMailDriver, mailDriverNameFromEnv } from "./mail.drivers";
import { BounceWebhookService } from "./bounce-webhook.service";
import { MailController } from "./mail.controller";
import { MailLimits } from "./mail-limits";
import { MAIL_DRIVER, MailService } from "./mail.service";
import { SuppressionsService } from "./suppressions.service";

/**
 * Mail-Bereich (Schema `mail`, nur eigene Tabellen). Treiber per `MAIL_DRIVER=log|smtp` (Standard log);
 * der Treiber (und damit der SMTP-Zugang) wird erst beim Versand angelegt; der Worker prueft ihn beim Start
 * (`MailService.assertDriverReady`), die API startet auch ohne SMTP_USER/SMTP_PASS.
 */
@Module({
  controllers: [MailController],
  providers: [{ provide: MAIL_DRIVER, useFactory: () => new LazyMailDriver(mailDriverNameFromEnv()) }, MailService, MailLimits, SuppressionsService, BounceWebhookService],
  exports: [MailService, MailLimits, SuppressionsService],
})
export class MailModule {}
