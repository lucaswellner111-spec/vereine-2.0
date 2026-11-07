import { HttpException, Logger } from "@nestjs/common";
import type { Cache } from "../cache/cache.module";

const log = new Logger("RateLimit");

/**
 * Fachliches Nutzungslimit (z. B. Vereine/Tag, Beitraege/Stunde). Zaehler im Cache unter `lim:<key>`
 * (`rl:` gehoert @fastify/rate-limit). Faellt der Cache aus, wird NICHT blockiert (fail open).
 */
export async function enforceLimit(cache: Cache, key: string, max: number, windowSec: number, message: string): Promise<void> {
  let n: number;
  try {
    n = await cache.incr(`lim:${key}`, windowSec);
  } catch (err) {
    log.warn(`Limit-Zaehler nicht erreichbar (${(err as Error)?.name ?? "Fehler"}), Anfrage wird zugelassen.`);
    return;
  }
  if (n > max) throw new HttpException({ message, statusCode: 429 }, 429);
}

/** Einheitlicher Text fuer Nutzungslimits. */
export const limitMessage = (what: string) => `Du hast das Limit für ${what} erreicht. Bitte versuche es später erneut.`;
