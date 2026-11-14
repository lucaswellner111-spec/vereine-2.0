import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { MailModule } from "../mail/mail.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrgsModule } from "../orgs/orgs.module";
import { GuardianController, GuardianInviteController } from "./guardian.controller";
import { GuardianService } from "./guardian.service";

/** Elternkonto -> Jugendkonten (Etappe E1). Der Datenschutz-Bereich importiert dieses Modul (Auskunft/Loeschung der Kinder). */
@Module({
  imports: [AuthModule, EventsModule, MailModule, NotificationsModule, OrgsModule],
  controllers: [GuardianController, GuardianInviteController],
  providers: [GuardianService],
  exports: [GuardianService],
})
export class GuardianModule {}
