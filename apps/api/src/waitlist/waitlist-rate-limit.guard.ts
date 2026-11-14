import { createHmac } from "node:crypto";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { CACHE, type Cache } from "../cache/cache.module";
import { enforceLimit } from "../common/rate-limit";
import { derivedKey } from "../common/secret-key";

/** Anmeldungen je IP und Stunde. req.ip ist hinter Caddy die echte Client-IP (wie public-rate-limit.guard, TRUST_PROXY). */
export const WAITLIST_SIGNUPS_PER_IP_HOUR = 30; // Infoabend: viele Leute im selben WLAN
/** Bestaetigen/Austragen je IP und Minute. */
export const WAITLIST_LINKS_PER_IP_MIN = 30;

const MESSAGE = "Zu viele Anfragen. Bitte warte einen Moment.";
/** IP nur gehasht im Zaehler-Schluessel, nie gespeichert oder geloggt. */
const ipKey = (ctx: ExecutionContext) => createHmac("sha256", derivedKey("waitlist-ip")).update(ctx.switchToHttp().getRequest<FastifyRequest>().ip ?? "").digest("hex");

@Injectable()
export class WaitlistSignupRateLimitGuard implements CanActivate {
  constructor(@Inject(CACHE) private readonly cache: Cache) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await enforceLimit(this.cache, `wl:ip:h:${ipKey(ctx)}`, WAITLIST_SIGNUPS_PER_IP_HOUR, 3600, MESSAGE);
    return true;
  }
}

@Injectable()
export class WaitlistLinkRateLimitGuard implements CanActivate {
  constructor(@Inject(CACHE) private readonly cache: Cache) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await enforceLimit(this.cache, `wl:ip:m:${ipKey(ctx)}`, WAITLIST_LINKS_PER_IP_MIN, 60, MESSAGE);
    return true;
  }
}
