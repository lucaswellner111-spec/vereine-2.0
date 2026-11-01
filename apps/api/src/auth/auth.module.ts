import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuditService } from "./audit.service";
import { AuthService } from "./auth.service";
import { TwoFactorService } from "./two-factor.service";
import { UsersDirectory } from "./users-directory.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, TwoFactorService, UsersDirectory, AuditService],
  exports: [AuthService, UsersDirectory, AuditService],
})
export class AuthModule {}
