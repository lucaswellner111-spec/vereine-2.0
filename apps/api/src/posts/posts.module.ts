import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { MediaModule } from "../media/media.module";
import { ProfileAccessModule } from "../profiles/profile-access.module";
import { ProfilesModule } from "../profiles/profiles.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrgsModule } from "../orgs/orgs.module";
import { ActivityService } from "./activity.service";
import { ModerationService } from "./moderation.service";
import { PostsController } from "./posts.controller";
import { PostsService } from "./posts.service";

@Module({
  imports: [AuthModule, ChatModule, ProfileAccessModule, OrgsModule, NotificationsModule, ProfilesModule, MediaModule],
  controllers: [PostsController],
  providers: [PostsService, ModerationService, ActivityService],
  exports: [ModerationService, PostsService],
})
export class PostsModule {}
