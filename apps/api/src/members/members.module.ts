import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrgsModule } from "../orgs/orgs.module";
import { MembersController } from "./members.controller";
import { MembersService } from "./members.service";

@Module({
  imports: [AuthModule, OrgsModule],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
