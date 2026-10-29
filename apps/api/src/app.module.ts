import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DbModule } from "./db/db.module";
import { HealthController } from "./health.controller";
import { NotificationsModule } from "./notifications/notifications.module";
import { OrgsModule } from "./orgs/orgs.module";
import { PostsModule } from "./posts/posts.module";
import { PrivacyModule } from "./privacy/privacy.module";

@Module({
  imports: [DbModule, AuthModule, PrivacyModule, OrgsModule, PostsModule, NotificationsModule],
  controllers: [HealthController],
})
export class AppModule {}
