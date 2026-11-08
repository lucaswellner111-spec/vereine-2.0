import { Module } from "@nestjs/common";
import { createMailDriver, mailConfigFromEnv } from "./mail.drivers";
import { MAIL_DRIVER, MailService } from "./mail.service";

/** Treiber per `MAIL_DRIVER=log|smtp` (Standard log). Fehlkonfiguration bricht den Start ab (API und Worker). */
@Module({
  providers: [{ provide: MAIL_DRIVER, useFactory: () => createMailDriver(mailConfigFromEnv()) }, MailService],
  exports: [MailService],
})
export class MailModule {}
