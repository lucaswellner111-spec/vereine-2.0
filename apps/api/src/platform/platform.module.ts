import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { MailModule } from "../mail/mail.module";
import { PostsModule } from "../posts/posts.module";
import { PlatformController } from "./platform.controller";

@Module({
  imports: [AuthModule, ChatModule, MailModule, PostsModule],
  controllers: [PlatformController],
})
export class PlatformModule {}
