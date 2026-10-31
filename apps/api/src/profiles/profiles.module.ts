import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProfileAccess } from "./profile-access.service";
import { ProfilesController } from "./profiles.controller";
import { ProfilesService } from "./profiles.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfileAccess],
  exports: [ProfileAccess],
})
export class ProfilesModule {}
