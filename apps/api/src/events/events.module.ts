import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrgsModule } from "../orgs/orgs.module";
import { ProfilesModule } from "../profiles/profiles.module";
import { CalendarFeedController } from "./calendar-feed.controller";
import { CalendarFeedService } from "./calendar-feed.service";
import { EventsController } from "./events.controller";
import { AttendanceService } from "./attendance.service";
import { EventsService } from "./events.service";
import { ShiftsService } from "./shifts.service";
import { TeamsService } from "./teams.service";

@Module({
  imports: [AuthModule, OrgsModule, NotificationsModule, ProfilesModule],
  controllers: [EventsController, CalendarFeedController],
  providers: [EventsService, TeamsService, CalendarFeedService, ShiftsService, AttendanceService],
  exports: [EventsService, CalendarFeedService],
})
export class EventsModule {}
