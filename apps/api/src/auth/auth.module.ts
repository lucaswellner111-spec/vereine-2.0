import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { UsersDirectory } from "./users-directory.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, UsersDirectory],
  exports: [AuthService, UsersDirectory],
})
export class AuthModule {}
