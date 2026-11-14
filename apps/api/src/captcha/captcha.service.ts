import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { CaptchaChallenge, CaptchaSolution } from "@vereine/shared";
import { CACHE, type Cache } from "../cache/cache.module";
import { derivedKey } from "../common/secret-key";

/** Gesuchte Zahl liegt in 0..MAX_NUMBER (ca. 75 000 Hashes im Schnitt: unter einer Sekunde im Browser). */
export const CAPTCHA_MAX_NUMBER = 150_000;
/** Gueltigkeit einer Aufgabe (Aufgabe wird beim Oeffnen des Formulars geholt und geloest). */
export const CAPTCHA_TTL_S = 10 * 60;

/**
 * Bot-Abwehr an: `CAPTCHA_ENFORCE=true|false`; ohne Angabe nur in Produktion (Tests, lokale Entwicklung und E2E ohne
 * Pruefung). Wird bei jedem Aufruf gelesen.
 */
export function captchaEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.CAPTCHA_ENFORCE?.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return env.NODE_ENV === "production";
}

const sha256hex = (text: string) => createHash("sha256").update(text).digest("hex");
const usedKey = (signature: string) => `captcha:used:${signature}`;

/**
 * Selbst gehostetes Proof-of-Work-Captcha (Idee von ALTCHA, eigene Umsetzung, keine Drittanbieter-Requests):
 * Der Server gibt `challenge = SHA-256(salt + n)` fuer eine geheime Zahl n aus, signiert mit HMAC (Schluessel aus
 * AUTH_SECRET_KEY, eigener Zweck). Der Browser sucht n (Rechenarbeit, keine Bedienung fuer die Person). Der Server prueft
 * Signatur (konstante Zeit), Ablauf, Hash und dass die Aufgabe noch nie eingeloest wurde (Einmalverwendung im Cache/Redis).
 * Es werden keine Personendaten gespeichert; im Cache liegt nur die Signatur der eingeloesten Aufgabe bis zum Ablauf.
 */
@Injectable()
export class CaptchaService {
  constructor(@Inject(CACHE) private readonly cache: Cache) {}

  private sign(challenge: string, salt: string): string {
    return createHmac("sha256", derivedKey("captcha")).update(`${challenge}|${salt}`).digest("hex");
  }

  createChallenge(now = Date.now()): CaptchaChallenge {
    const expires = Math.floor(now / 1000) + CAPTCHA_TTL_S;
    const salt = `${randomBytes(12).toString("hex")}?expires=${expires}`;
    const challenge = sha256hex(`${salt}${randomInt(0, CAPTCHA_MAX_NUMBER + 1)}`);
    return { algorithm: "SHA-256", challenge, salt, signature: this.sign(challenge, salt), maxnumber: CAPTCHA_MAX_NUMBER };
  }

  /** Dekodiert den Header (base64 von JSON); null bei jeder Abweichung. */
  parse(token: unknown): CaptchaSolution | null {
    if (typeof token !== "string" || token.length < 40 || token.length > 2000) return null;
    try {
      const v = JSON.parse(Buffer.from(token, "base64").toString("utf8")) as Partial<CaptchaSolution>;
      if (v.algorithm !== "SHA-256" || typeof v.challenge !== "string" || typeof v.salt !== "string" || typeof v.signature !== "string") return null;
      if (!Number.isInteger(v.number) || v.number! < 0 || v.number! > CAPTCHA_MAX_NUMBER) return null;
      return v as CaptchaSolution;
    } catch {
      return null;
    }
  }

  /** true = gueltig und jetzt verbraucht; jede weitere Verwendung derselben Aufgabe ergibt false. */
  async verifyAndConsume(token: unknown, now = Date.now()): Promise<boolean> {
    const s = this.parse(token);
    if (!s) return false;
    const expires = Number(/\?expires=(\d{1,12})$/.exec(s.salt)?.[1]);
    if (!Number.isFinite(expires) || expires * 1000 < now) return false;
    const expected = Buffer.from(this.sign(s.challenge, s.salt));
    const given = Buffer.from(s.signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    if (sha256hex(`${s.salt}${s.number}`) !== s.challenge) return false;
    // Einmalverwendung: nur der erste Aufruf setzt den Schluessel. Faellt der Cache aus, wird NICHT zugelassen (fail closed).
    const ttl = Math.max(1, Math.ceil(expires - now / 1000) + 5);
    return this.cache.setNx(usedKey(s.signature), "1", ttl).catch(() => false);
  }
}
