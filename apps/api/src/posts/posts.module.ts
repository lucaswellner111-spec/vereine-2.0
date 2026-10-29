import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrgsModule } from "../orgs/orgs.module";
import { ModerationService } from "./moderation.service";
import { PostsController } from "./posts.controller";
import { PostsService } from "./posts.service";

@Module({
  imports: [AuthModule, OrgsModule, NotificationsModule],
  controllers: [PostsController],
  providers: [PostsService, ModerationService],
})
export class PostsModule {}
