import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AvvModule } from "../avv/avv.module";
import { MailModule } from "../mail/mail.module";
import { MembersModule } from "../members/members.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrgsModule } from "../orgs/orgs.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { FeeRunsController } from "./fee-runs.controller";
import { FeeRunsService } from "./fee-runs.service";

@Module({
  imports: [AuthModule, AvvModule, MailModule, OrgsModule, NotificationsModule, MembersModule],
  controllers: [BillingController, FeeRunsController],
  providers: [BillingService, FeeRunsService],
  exports: [BillingService],
})
export class BillingModule {}
