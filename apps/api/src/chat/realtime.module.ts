import { Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import { createBus, REALTIME_BUS, type RealtimeBus } from "./realtime-bus";

/**
 * Gemeinsamer Echtzeit-Bus (Redis Pub/Sub bzw. Speicher): wird vom Chat und von den Benachrichtigungen genutzt.
 * Eigenes Modul, damit `notifications` ihn nutzen kann, ohne den Chat zu importieren (der importiert seinerseits `notifications`).
 */
@Module({
  providers: [{ provide: REALTIME_BUS, useFactory: createBus }],
  exports: [REALTIME_BUS],
})
export class RealtimeModule implements OnModuleDestroy {
  constructor(@Inject(REALTIME_BUS) private readonly bus: RealtimeBus) {}
  async onModuleDestroy() {
    await this.bus.close();
  }
}
