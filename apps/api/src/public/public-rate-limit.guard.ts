import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { CACHE, type Cache } from "../cache/cache.module";
import { enforceLimit } from "../common/rate-limit";

export const PUBLIC_LIMIT_PER_MIN = 60;
/** Bilder (Logo/Banner): eine Finder-Seite laedt bis zu 30 Logos, daher eigenes, hoeheres Limit. */
export const PUBLIC_MEDIA_LIMIT_PER_MIN = 600;

const MESSAGE = "Zu viele Anfragen. Bitte warte einen Moment.";

/**
 * Zaehler je IP aus req.ip (nur vertrauenswuerdige Proxys duerfen X-Forwarded-For setzen, siehe TRUST_PROXY).
 * Der Zaehler liegt nur im Cache und laeuft nach 60 s ab; die IP wird nicht gespeichert oder geloggt.
 */
async function limitByIp(cache: Cache, ctx: ExecutionContext, scope: string, max: number): Promise<boolean> {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  await enforceLimit(cache, `${scope}:${req.ip}`, max, 60, MESSAGE);
  return true;
}

/** Daten des oeffentlichen Bereichs (Finder, Vereinsseite): 60 Anfragen je Minute und IP. */
@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  constructor(@Inject(CACHE) private readonly cache: Cache) {}

  canActivate(ctx: ExecutionContext): Promise<boolean> {
    return limitByIp(this.cache, ctx, "pub:ip", PUBLIC_LIMIT_PER_MIN);
  }
}

/** Oeffentliche Bilder: 600 Anfragen je Minute und IP, getrennter Zaehler. */
@Injectable()
export class PublicMediaRateLimitGuard implements CanActivate {
  constructor(@Inject(CACHE) private readonly cache: Cache) {}

  canActivate(ctx: ExecutionContext): Promise<boolean> {
    return limitByIp(this.cache, ctx, "pub:media:ip", PUBLIC_MEDIA_LIMIT_PER_MIN);
  }
}
