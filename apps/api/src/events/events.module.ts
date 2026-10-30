import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrgsModule } from "../orgs/orgs.module";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { TeamsService } from "./teams.service";

@Module({
  imports: [AuthModule, OrgsModule, NotificationsModule],
  controllers: [EventsController],
  providers: [EventsService, TeamsService],
})
export class EventsModule {}
