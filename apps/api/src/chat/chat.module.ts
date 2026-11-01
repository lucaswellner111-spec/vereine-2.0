import { Module, type OnModuleDestroy, Inject } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrgsModule } from "../orgs/orgs.module";
import { ChatCrypto } from "./chat-crypto.service";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { createBus, REALTIME_BUS, type RealtimeBus } from "./realtime-bus";

@Module({
  imports: [AuthModule, OrgsModule, NotificationsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatCrypto, { provide: REALTIME_BUS, useFactory: createBus }],
  exports: [ChatService, REALTIME_BUS],
})
export class ChatModule implements OnModuleDestroy {
  constructor(@Inject(REALTIME_BUS) private readonly bus: RealtimeBus) {}
  async onModuleDestroy() {
    await this.bus.close();
  }
}
