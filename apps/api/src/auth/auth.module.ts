import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuditService } from "./audit.service";
import { AuthService } from "./auth.service";
import { EmailFlowsService } from "./email-flows.service";
import { MailModule } from "../mail/mail.module";
import { TwoFactorService } from "./two-factor.service";
import { UsersDirectory } from "./users-directory.service";

@Module({
  imports: [MailModule],
  controllers: [AuthController],
  providers: [AuthService, EmailFlowsService, TwoFactorService, UsersDirectory, AuditService],
  exports: [AuthService, UsersDirectory, AuditService, TwoFactorService],
})
export class AuthModule {}
