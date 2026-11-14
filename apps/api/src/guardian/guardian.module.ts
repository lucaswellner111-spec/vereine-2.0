import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrgsModule } from "../orgs/orgs.module";
import { GuardianController } from "./guardian.controller";
import { GuardianService } from "./guardian.service";

/** Elternkonto -> Jugendkonten (Etappe E1). Der Datenschutz-Bereich importiert dieses Modul (Auskunft/Loeschung der Kinder). */
@Module({
  imports: [AuthModule, EventsModule, NotificationsModule, OrgsModule],
  controllers: [GuardianController],
  providers: [GuardianService],
  exports: [GuardianService],
})
export class GuardianModule {}
