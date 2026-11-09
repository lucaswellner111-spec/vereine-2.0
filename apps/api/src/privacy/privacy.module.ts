import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { ChatModule } from "../chat/chat.module";
import { EventsModule } from "../events/events.module";
import { MailModule } from "../mail/mail.module";
import { MediaModule } from "../media/media.module";
import { MembersModule } from "../members/members.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProfileAccessModule } from "../profiles/profile-access.module";
import { OrgsModule } from "../orgs/orgs.module";
import { PostsModule } from "../posts/posts.module";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";
import { RetentionService } from "./retention.service";

@Module({
  imports: [AuthModule, BillingModule, ChatModule, EventsModule, MailModule, MediaModule, MembersModule, NotificationsModule, OrgsModule, PostsModule, ProfileAccessModule],
  controllers: [PrivacyController],
  providers: [PrivacyService, RetentionService],
})
export class PrivacyModule {}
