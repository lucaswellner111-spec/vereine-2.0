import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProfileAccess } from "./profile-access.service";

/** Nur ProfileAccess (ohne Controller/ChatService), damit auch der Chat Avatare laden kann - ohne Modul-Kreis. */
@Module({
  imports: [AuthModule],
  providers: [ProfileAccess],
  exports: [ProfileAccess],
})
export class ProfileAccessModule {}
