import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrgAdminController } from "./org-admin.controller";
import { OrgAdminService } from "./org-admin.service";
import { OrgsController } from "./orgs.controller";
import { OrgsService } from "./orgs.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [OrgsController, OrgAdminController],
  providers: [OrgsService, OrgAdminService],
  exports: [OrgsService],
})
export class OrgsModule {}
