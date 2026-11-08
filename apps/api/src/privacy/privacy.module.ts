import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { ChatModule } from "../chat/chat.module";
import { EventsModule } from "../events/events.module";
import { MediaModule } from "../media/media.module";
import { MembersModule } from "../members/members.module";
import { OrgsModule } from "../orgs/orgs.module";
import { PostsModule } from "../posts/posts.module";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";

@Module({
  imports: [AuthModule, BillingModule, ChatModule, EventsModule, MediaModule, MembersModule, OrgsModule, PostsModule],
  controllers: [PrivacyController],
  providers: [PrivacyService],
})
export class PrivacyModule {}
