import { Global, Logger, Module } from "@nestjs/common";
import Redis from "ioredis";

export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** true = Backend erreichbar. */
  ping(): Promise<boolean>;
  readonly kind: "redis" | "memory";
}

export const REDIS = Symbol("REDIS");
export const CACHE = Symbol("CACHE");

/** Redis-Backend (Produktion, mehrere App-Server teilen sich den Cache). */
export class RedisCache implements Cache {
  readonly kind = "redis" as const;
  constructor(private readonly redis: Redis) {}

  get(key: string) {
    return this.redis.get(key);
  }
  async set(key: string, value: string, ttlSec: number) {
    await this.redis.set(key, value, "EX", ttlSec);
  }
  async del(...keys: string[]) {
    if (keys.length) await this.redis.del(...keys);
  }
  async ping() {
    try {
      return (await this.redis.ping()) === "PONG";
    } catch {
      return false;
    }
  }
}

/** Fallback ohne Redis (lokale Entwicklung, Tests). Gilt nur fuer EINEN Prozess! */
export class MemoryCache implements Cache {
  readonly kind = "memory" as const;
  private store = new Map<string, { value: string; expires: number }>();

  async get(key: string) {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }
  async set(key: string, value: string, ttlSec: number) {
    this.store.set(key, { value, expires: Date.now() + ttlSec * 1000 });
  }
  async del(...keys: string[]) {
    keys.forEach((k) => this.store.delete(k));
  }
  async ping() {
    return true;
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: (): Redis | null => {
        const url = process.env.REDIS_URL;
        if (!url) return null;
        const log = new Logger("Redis");
        const client = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
        client.on("error", (err) => log.warn(`Redis-Fehler: ${err.message}`));
        return client;
      },
    },
    {
      provide: CACHE,
      inject: [REDIS],
      useFactory: (redis: Redis | null): Cache => (redis ? new RedisCache(redis) : new MemoryCache()),
    },
  ],
  exports: [REDIS, CACHE],
})
export class CacheModule {}
