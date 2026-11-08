import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrgsModule } from "../orgs/orgs.module";
import { ChatModule } from "../chat/chat.module";
import { ProfileAccessModule } from "./profile-access.module";
import { ProfilesController } from "./profiles.controller";
import { ProfilesService } from "./profiles.service";

@Module({
  imports: [AuthModule, NotificationsModule, OrgsModule, ChatModule, ProfileAccessModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfileAccessModule],
})
export class ProfilesModule {}
