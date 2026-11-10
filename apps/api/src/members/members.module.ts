import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MailModule } from "../mail/mail.module";
import { OrgsModule } from "../orgs/orgs.module";
import { ProfileAccessModule } from "../profiles/profile-access.module";
import { MemberImportController } from "./member-import.controller";
import { MemberImportService } from "./member-import.service";
import { MembersController } from "./members.controller";
import { MembersService } from "./members.service";

@Module({
  imports: [AuthModule, OrgsModule, ProfileAccessModule, MailModule],
  controllers: [MembersController, MemberImportController],
  providers: [MembersService, MemberImportService],
  exports: [MembersService, MemberImportService],
})
export class MembersModule {}
