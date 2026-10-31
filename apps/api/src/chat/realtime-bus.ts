import { EventEmitter } from "node:events";
import { Logger } from "@nestjs/common";
import Redis from "ioredis";
import type { ChatEvent } from "@vereine/shared";

export const REALTIME_BUS = Symbol("REALTIME_BUS");

export type BusMessage = { userIds: string[]; event: ChatEvent };

/**
 * Verbindung zwischen API/Worker (senden) und WebSocket-Gateway (zustellen).
 * Die Ereignisse enthalten nur IDs - keine Nachrichteninhalte laufen durch Redis.
 */
export interface RealtimeBus {
  publish(msg: BusMessage): Promise<void>;
  subscribe(handler: (msg: BusMessage) => void): Promise<void>;
  close(): Promise<void>;
}

const CHANNEL = "chat:events";

/** Nur ein Prozess (lokal/Tests): Gateway muss im selben Prozess laufen. */
export class MemoryBus implements RealtimeBus {
  private readonly emitter = new EventEmitter();
  async publish(msg: BusMessage) {
    this.emitter.emit("msg", msg);
  }
  async subscribe(handler: (msg: BusMessage) => void) {
    this.emitter.on("msg", handler);
  }
  async close() {
    this.emitter.removeAllListeners();
  }
}

/** Redis Pub/Sub: mehrere API-/Gateway-Instanzen auf verschiedenen Servern. */
export class RedisBus implements RealtimeBus {
  private readonly log = new Logger("RealtimeBus");
  private readonly pub: Redis;
  private sub?: Redis;
  constructor(private readonly url: string) {
    this.pub = new Redis(url, { maxRetriesPerRequest: 2 });
    this.pub.on("error", (e) => this.log.warn(`Redis(pub): ${e.message}`));
  }
  async publish(msg: BusMessage) {
    await this.pub.publish(CHANNEL, JSON.stringify(msg)).catch((e) => this.log.warn(`publish: ${e.message}`));
  }
  async subscribe(handler: (msg: BusMessage) => void) {
    this.sub = new Redis(this.url);
    this.sub.on("error", (e) => this.log.warn(`Redis(sub): ${e.message}`));
    await this.sub.subscribe(CHANNEL);
    this.sub.on("message", (_ch, raw) => {
      try {
        handler(JSON.parse(raw));
      } catch {
        /* defekte Nachricht ignorieren */
      }
    });
  }
  async close() {
    this.pub.disconnect();
    this.sub?.disconnect();
  }
}

export function createBus(): RealtimeBus {
  const url = process.env.REDIS_URL;
  return url ? new RedisBus(url) : new MemoryBus();
}
