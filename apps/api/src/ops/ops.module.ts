import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { OpsService } from "./ops.service";

/** Betriebsüberwachung (Alarme, Worker-Lebenszeichen). Keine eigenen Tabellen, keine Personendaten. */
@Module({
  imports: [MailModule],
  providers: [OpsService],
  exports: [OpsService],
})
export class OpsModule {}
