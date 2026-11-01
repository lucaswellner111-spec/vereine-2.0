import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrgsModule } from "../orgs/orgs.module";
import { CalendarFeedController } from "./calendar-feed.controller";
import { CalendarFeedService } from "./calendar-feed.service";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { TeamsService } from "./teams.service";

@Module({
  imports: [AuthModule, OrgsModule, NotificationsModule],
  controllers: [EventsController, CalendarFeedController],
  providers: [EventsService, TeamsService, CalendarFeedService],
})
export class EventsModule {}
