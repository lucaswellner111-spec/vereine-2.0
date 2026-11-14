import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuditService } from "./audit.service";
import { AuthService } from "./auth.service";
import { EmailFlowsService } from "./email-flows.service";
import { MailModule } from "../mail/mail.module";
import { TwoFactorPolicyService } from "./two-factor-policy.service";
import { TwoFactorService } from "./two-factor.service";
import { UsersDirectory } from "./users-directory.service";
import { CaptchaModule } from "../captcha/captcha.module";

@Module({
  imports: [CaptchaModule, MailModule],
  controllers: [AuthController],
  providers: [AuthService, EmailFlowsService, TwoFactorService, TwoFactorPolicyService, UsersDirectory, AuditService],
  exports: [AuthService, UsersDirectory, AuditService, TwoFactorService, TwoFactorPolicyService],
})
export class AuthModule {}
