import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { EventsModule } from "../events/events.module";
import { MembersModule } from "../members/members.module";
import { OrgsModule } from "../orgs/orgs.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [AuthModule, OrgsModule, MembersModule, BillingModule, EventsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
