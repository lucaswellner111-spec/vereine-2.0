import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MailModule } from "../mail/mail.module";
import { DigestService } from "./digest.service";
import { NotificationsController } from "./notifications.controller";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [AuthModule, MailModule],
  controllers: [NotificationsController, PushController],
  providers: [NotificationsService, PushService, DigestService],
  exports: [NotificationsService, PushService, DigestService],
})
export class NotificationsModule {}
