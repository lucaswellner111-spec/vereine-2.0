import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrgsModule } from "../orgs/orgs.module";
import { ProfileAccessModule } from "../profiles/profile-access.module";
import { ChatCrypto } from "./chat-crypto.service";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { RealtimeModule } from "./realtime.module";

@Module({
  imports: [AuthModule, OrgsModule, NotificationsModule, ProfileAccessModule, RealtimeModule],
  controllers: [ChatController],
  providers: [ChatService, ChatCrypto],
  exports: [ChatService, RealtimeModule],
})
export class ChatModule {}
