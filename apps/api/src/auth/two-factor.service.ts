import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, HttpException, Inject, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, isNull, sql } from "drizzle-orm";
import QRCode from "qrcode";
import type { TwoFactorSetup, TwoFactorStatus } from "@vereine/shared";
import { CACHE, type Cache } from "../cache/cache.module";
import { DB, type Database } from "../db/db.module";
import { auditLog, recoveryCodes, userTotp } from "../db/schema";
import { newSecret, otpauthUrl, stepAt, verifyTotp } from "./totp";

const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_FAILS = 5;
const FAIL_WINDOW_S = 15 * 60;
const failKey = (userId: string) => `login:2fa:fail:${userId}`;
const RECOVERY_COUNT = 10;
const ARGON = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/**
 * Zwei-Faktor-Anmeldung per Authenticator-App (TOTP) mit Notfallcodes.
 * - Das TOTP-Geheimnis liegt AES-256-GCM-verschluesselt in der Datenbank (Schluessel AUTH_SECRET_KEY, 32 Byte base64),
 *   Notfallcodes nur als Argon2-Hash. Jeder Code gilt einmal (Replay-Schutz ueber den letzten Zeitschritt).
 * - Nach dem Passwort bekommt der Client eine kurzlebige, signierte Herausforderung (5 Minuten), keine Sitzung.
 */
@Injectable()
export class TwoFactorService {
  private readonly log = new Logger("TwoFactor");
  private devKey?: Buffer;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CACHE) private readonly cache: Cache,
  ) {}

  private key(): Buffer {
    const raw = process.env.AUTH_SECRET_KEY;
    if (raw) {
      const key = Buffer.from(raw, "base64");
      if (key.length !== 32) throw new ServiceUnavailableException("AUTH_SECRET_KEY muss 32 Byte (base64) lang sein.");
      return key;
    }
    if (process.env.NODE_ENV === "production") {
      throw new ServiceUnavailableException("Zwei-Faktor-Anmeldung ist auf diesem Server nicht konfiguriert.");
    }
    if (!this.devKey) {
      this.log.warn("AUTH_SECRET_KEY fehlt: temporaerer Entwicklungsschluessel (2FA-Daten nicht dauerhaft lesbar).");
      this.devKey = randomBytes(32);
    }
    return this.devKey;
  }

  private encrypt(text: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
  }

  private decrypt(blob: string): string {
    const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", this.key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  }

  // --- Herausforderung (nach dem Passwort) ---------------------------------------

  challenge(userId: string): string {
    const body = Buffer.from(JSON.stringify({ u: userId, exp: Date.now() + CHALLENGE_TTL_MS })).toString("base64url");
    return `${body}.${this.sign(body)}`;
  }

  private sign(body: string): string {
    // Eigener Teilschluessel, damit der Hauptschluessel nicht direkt als HMAC-Schluessel dient.
    const sub = createHmac("sha256", this.key()).update("login-challenge").digest();
    return createHmac("sha256", sub).update(body).digest("base64url");
  }

  userFromChallenge(token: string): string {
    const [body, sig] = token.split(".");
    const bad = new UnauthorizedException("Die Anmeldung ist abgelaufen. Bitte melde dich neu an.");
    if (!body || !sig) throw bad;
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw bad;
    try {
      const { u, exp } = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u: string; exp: number };
      if (typeof u !== "string" || typeof exp !== "number" || exp < Date.now()) throw bad;
      return u;
    } catch {
      throw bad;
    }
  }

  // --- Status und Einrichtung ----------------------------------------------------

  async isEnabled(userId: string): Promise<boolean> {
    const [row] = await this.db.select({ at: userTotp.enabledAt }).from(userTotp).where(eq(userTotp.userId, userId)).limit(1);
    return !!row?.at;
  }

  async status(userId: string): Promise<TwoFactorStatus> {
    const enabled = await this.isEnabled(userId);
    const [{ n }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));
    return { enabled, recoveryCodesLeft: enabled ? n : 0 };
  }

  async setup(userId: string, account: string): Promise<TwoFactorSetup> {
    if (await this.isEnabled(userId)) throw new ConflictException("Zwei-Faktor ist bereits aktiv.");
    const secret = newSecret();
    await this.db
      .insert(userTotp)
      .values({ userId, secretEnc: this.encrypt(secret), enabledAt: null, lastStep: 0 })
      .onConflictDoUpdate({ target: userTotp.userId, set: { secretEnc: this.encrypt(secret), enabledAt: null, lastStep: 0 } });
    const url = otpauthUrl(secret, account);
    return { secret, otpauthUrl: url, qrSvg: await QRCode.toString(url, { type: "svg", margin: 1, width: 192 }) };
  }

  async enable(userId: string, code: string): Promise<string[]> {
    const [row] = await this.db.select().from(userTotp).where(eq(userTotp.userId, userId)).limit(1);
    if (!row) throw new BadRequestException("Starte zuerst die Einrichtung.");
    if (row.enabledAt) throw new ConflictException("Zwei-Faktor ist bereits aktiv.");
    await this.assertNotLocked(userId);
    const step = verifyTotp(this.decrypt(row.secretEnc), code.replace(/\s/g, ""));
    if (step === null) {
      await this.cache.incr(failKey(userId), FAIL_WINDOW_S).catch(() => undefined);
      throw new BadRequestException("Der Code stimmt nicht. Prüfe die Uhrzeit deines Geräts und versuche es erneut.");
    }
    await this.db.update(userTotp).set({ enabledAt: new Date(), lastStep: step }).where(eq(userTotp.userId, userId));
    await this.cache.del(failKey(userId)).catch(() => undefined);
    await this.db.insert(auditLog).values({ userId, action: "user.2fa.enabled" });
    return this.newRecoveryCodes(userId);
  }

  async disable(userId: string, code: string): Promise<void> {
    await this.requireValidCode(userId, code);
    await this.db.delete(userTotp).where(eq(userTotp.userId, userId));
    await this.db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
    await this.db.insert(auditLog).values({ userId, action: "user.2fa.disabled" });
  }

  async regenerateRecoveryCodes(userId: string, code: string): Promise<string[]> {
    await this.requireValidCode(userId, code);
    return this.newRecoveryCodes(userId);
  }

  private async newRecoveryCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_COUNT }, () => {
      const raw = randomBytes(8).toString("hex").slice(0, 10);
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
    const hashes = await Promise.all(codes.map((c) => hash(c, ARGON)));
    await this.db.transaction(async (tx) => {
      await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
      await tx.insert(recoveryCodes).values(hashes.map((codeHash) => ({ userId, codeHash })));
    });
    await this.db.insert(auditLog).values({ userId, action: "user.2fa.recovery.generated" });
    return codes;
  }

  // --- Pruefung beim Login und bei sensiblen Aktionen ----------------------------

  private async assertNotLocked(userId: string) {
    const fails = Number((await this.cache.get(failKey(userId)).catch(() => null)) ?? 0);
    if (fails >= MAX_FAILS) {
      throw new HttpException({ message: "Zu viele falsche Codes. Bitte warte 15 Minuten.", statusCode: 429 }, 429);
    }
  }

  /** Prueft einen TOTP-Code oder Notfallcode; liefert false statt zu werfen. Zaehlt Fehlversuche. */
  async verifyCode(userId: string, input: string): Promise<boolean> {
    await this.assertNotLocked(userId);
    const code = input.replace(/\s/g, "");
    const [row] = await this.db.select().from(userTotp).where(eq(userTotp.userId, userId)).limit(1);
    let ok = false;
    if (row?.enabledAt && /^\d{6}$/.test(code)) {
      const step = verifyTotp(this.decrypt(row.secretEnc), code);
      if (step !== null && step > row.lastStep) {
        // Atomar: ein Code gilt nur einmal, auch bei parallelen Anfragen.
        const claimed = await this.db
          .update(userTotp)
          .set({ lastStep: step })
          .where(and(eq(userTotp.userId, userId), sql`${userTotp.lastStep} < ${step}`))
          .returning({ id: userTotp.userId });
        ok = claimed.length > 0;
      }
    } else if (row?.enabledAt && /^[0-9a-f]{5}-[0-9a-f]{5}$/i.test(code)) {
      const open = await this.db.select().from(recoveryCodes).where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));
      for (const rc of open) {
        if (await verify(rc.codeHash, code.toLowerCase())) {
          const claimed = await this.db
            .update(recoveryCodes)
            .set({ usedAt: new Date() })
            .where(and(eq(recoveryCodes.id, rc.id), isNull(recoveryCodes.usedAt)))
            .returning({ id: recoveryCodes.id });
          ok = claimed.length > 0;
          if (ok) await this.db.insert(auditLog).values({ userId, action: "user.2fa.recovery.used" });
          break;
        }
      }
    }
    if (ok) await this.cache.del(failKey(userId)).catch(() => undefined);
    else await this.cache.incr(failKey(userId), FAIL_WINDOW_S).catch(() => undefined);
    return ok;
  }

  private async requireValidCode(userId: string, code: string) {
    if (!(await this.isEnabled(userId))) throw new BadRequestException("Zwei-Faktor ist nicht aktiv.");
    if (!(await this.verifyCode(userId, code))) throw new UnauthorizedException("Der Code ist falsch.");
  }

  /** Nur fuer Tests: aktueller Zeitschritt. */
  currentStep = () => stepAt(Date.now());
}
