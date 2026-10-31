import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuditService } from "./audit.service";
import { AuthService } from "./auth.service";
import { UsersDirectory } from "./users-directory.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, UsersDirectory, AuditService],
  exports: [AuthService, UsersDirectory, AuditService],
})
export class AuthModule {}
