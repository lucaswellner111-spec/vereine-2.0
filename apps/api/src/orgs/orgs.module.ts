import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AvvController } from "../avv/avv.controller";
import { AvvModule } from "../avv/avv.module";
import { MailModule } from "../mail/mail.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProfileAccessModule } from "../profiles/profile-access.module";
import { OrgAdminController } from "./org-admin.controller";
import { OrgEvents } from "./org-events";
import { OrgAdminService } from "./org-admin.service";
import { OrgsController } from "./orgs.controller";
import { OrgsService } from "./orgs.service";
import { SecurityController } from "./security.controller";
import { TwoFactorGuard } from "./two-factor.guard";
import { CaptchaModule } from "../captcha/captcha.module";

@Module({
  imports: [CaptchaModule, AuthModule, AvvModule, MailModule, NotificationsModule, ProfileAccessModule],
  controllers: [OrgsController, OrgAdminController, AvvController, SecurityController],
  providers: [OrgsService, OrgAdminService, OrgEvents, TwoFactorGuard],
  exports: [OrgsService, OrgEvents, OrgAdminService, TwoFactorGuard],
})
export class OrgsModule {}
