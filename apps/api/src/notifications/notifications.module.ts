import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsController } from "./notifications.controller";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController, PushController],
  providers: [NotificationsService, PushService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
