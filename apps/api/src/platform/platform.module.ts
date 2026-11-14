import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { MailModule } from "../mail/mail.module";
import { OpsModule } from "../ops/ops.module";
import { OrgsModule } from "../orgs/orgs.module";
import { PostsModule } from "../posts/posts.module";
import { WaitlistModule } from "../waitlist/waitlist.module";
import { PlatformController } from "./platform.controller";

@Module({
  imports: [AuthModule, ChatModule, MailModule, OpsModule, OrgsModule, PostsModule, WaitlistModule],
  controllers: [PlatformController],
})
export class PlatformModule {}
