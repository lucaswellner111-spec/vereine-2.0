import { Module } from "@nestjs/common";
import { createMailDriver, mailConfigFromEnv } from "./mail.drivers";
import { MailController } from "./mail.controller";
import { MailLimits } from "./mail-limits";
import { MAIL_DRIVER, MailService } from "./mail.service";
import { SuppressionsService } from "./suppressions.service";

/**
 * Mail-Bereich (Schema `mail`, nur eigene Tabellen). Treiber per `MAIL_DRIVER=log|smtp` (Standard log);
 * Fehlkonfiguration bricht den Start ab (API und Worker).
 */
@Module({
  controllers: [MailController],
  providers: [{ provide: MAIL_DRIVER, useFactory: () => createMailDriver(mailConfigFromEnv()) }, MailService, MailLimits, SuppressionsService],
  exports: [MailService, MailLimits, SuppressionsService],
})
export class MailModule {}
