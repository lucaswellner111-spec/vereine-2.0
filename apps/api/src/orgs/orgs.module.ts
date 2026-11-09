import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MailModule } from "../mail/mail.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProfileAccessModule } from "../profiles/profile-access.module";
import { OrgAdminController } from "./org-admin.controller";
import { OrgEvents } from "./org-events";
import { OrgAdminService } from "./org-admin.service";
import { OrgsController } from "./orgs.controller";
import { OrgsService } from "./orgs.service";

@Module({
  imports: [AuthModule, MailModule, NotificationsModule, ProfileAccessModule],
  controllers: [OrgsController, OrgAdminController],
  providers: [OrgsService, OrgAdminService, OrgEvents],
  exports: [OrgsService, OrgEvents, OrgAdminService],
})
export class OrgsModule {}
