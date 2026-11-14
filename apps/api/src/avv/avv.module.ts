import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AvvService } from "./avv.service";

/** Nur der Dienst (ohne Abhaengigkeit zu orgs); der Controller liegt im OrgsModule, damit es keinen Modulzyklus gibt. */
@Module({
  imports: [AuthModule],
  providers: [AvvService],
  exports: [AvvService],
})
export class AvvModule {}
