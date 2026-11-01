import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { ChatModule } from "./chat/chat.module";
import { CacheModule } from "./cache/cache.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DbModule } from "./db/db.module";
import { EventsModule } from "./events/events.module";
import { JobsModule } from "./jobs/jobs.module";
import { HealthController } from "./health.controller";
import { MetricsController } from "./metrics/metrics.controller";
import { MediaModule } from "./media/media.module";
import { MembersModule } from "./members/members.module";
import { ProfilesModule } from "./profiles/profiles.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { OrgsModule } from "./orgs/orgs.module";
import { PlatformModule } from "./platform/platform.module";
import { PostsModule } from "./posts/posts.module";
import { PrivacyModule } from "./privacy/privacy.module";

@Module({
  imports: [DbModule, CacheModule, JobsModule, AuthModule, PrivacyModule, OrgsModule, PostsModule, NotificationsModule, EventsModule, ChatModule, PlatformModule, ProfilesModule, MediaModule, BillingModule, MembersModule, DashboardModule],
  controllers: [HealthController, MetricsController],
})
export class AppModule {}
