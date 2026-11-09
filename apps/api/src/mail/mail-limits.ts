import { createHmac } from "node:crypto";
import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { CACHE, type Cache } from "../cache/cache.module";
import { berlinDate } from "../common/berlin-date";
import { derivedKey } from "../common/secret-key";

/**
 * Kostenbremse fuer den Mailversand (Scaleway TEM rechnet je Mail ab). Alle Zaehler liegen im Cache-Redis
 * (`REDIS_URL`, Tests: ioredis-mock/Prozess-Cache), Adressen nur als HMAC-Hash, nie im Klartext.
 *
 * - Global je Kalendertag (Europe/Berlin) und Kalendermonat: `MAIL_DAILY_LIMIT` (200) / `MAIL_MONTHLY_LIMIT` (3000).
 *   Wichtige Mails (Bestaetigung, Passwort, E-Mail-Wechsel) duerfen bis 100 % gehen, alle anderen stoppen bei 80 %.
 *   Gezaehlt wird beim tatsaechlichen Versand (Worker).
 * - Je Empfaenger 5/Stunde und 20/Tag, je ausloesendem Konto 20/Tag, Einladungs-Mails je Verein 100/Tag
 *   (gezaehlt beim Einreihen, also in der API).
 * - Passwort vergessen/Bestaetigung: je IP 5/Stunde, je Adresse 3/Stunde.
 *
 * Bekannte Grenze: Das Cache-Redis persistiert nicht (allkeys-lru, ohne AOF). Ein Neustart des Redis-Containers setzt die
 * Zaehler zurueck; das Monatslimit ist deshalb eine Bremse, keine harte Abrechnungsgrenze (docs/OFFENE-PUNKTE.md).
 */
export const MAIL_LIMITS = {
  recipientPerHour: 5,
  recipientPerDay: 20,
  actorPerDay: 20,
  orgInvitesPerDay: 100,
  authPerIpHour: 5,
  authPerAddressHour: 3,
  /** Anteil des globalen Kontingents fuer nicht wichtige Mails. */
  normalShare: 0.8,
} as const;

export type MailPriority = "critical" | "normal";

export type QuotaStatus = {
  day: { used: number; limit: number; percent: number };
  month: { used: number; limit: number; percent: number };
  /** Hoechster Prozentwert von Tag/Monat (ganzzahlig). */
  percent: number;
  /** ab 80 %: nicht wichtige Mails werden zurueckgehalten. */
  warning: boolean;
};

const HOUR = 3600;
const DAY = 24 * HOUR;
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw?.trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function globalLimitsFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return { daily: positiveInt(env.MAIL_DAILY_LIMIT, 200), monthly: positiveInt(env.MAIL_MONTHLY_LIMIT, 3000) };
}

/** Normalisierte Adresse als HMAC-SHA256 (Teilschluessel "mail-address"): gleiche Adresse = gleicher Hash, nicht umkehrbar. */
export function addressHash(email: string): string {
  return createHmac("sha256", derivedKey("mail-address", "Mailversand ist auf diesem Server nicht konfiguriert.")).update(email.trim().toLowerCase()).digest("hex");
}

/** Erlaubte Menge fuer eine Prioritaet (wichtig 100 %, sonst 80 %, abgerundet). */
export const allowedFor = (limit: number, priority: MailPriority) => (priority === "critical" ? limit : Math.floor(limit * MAIL_LIMITS.normalShare));

const pct = (used: number, limit: number) => Math.min(100, Math.round((used / limit) * 100));

@Injectable()
export class MailLimits {
  private readonly log = new Logger("MailLimits");
  readonly global = globalLimitsFromEnv();

  constructor(@Inject(CACHE) private readonly cache: Cache) {}

  private keys(now = new Date()) {
    const day = berlinDate(now);
    return { day: `mail:g:d:${day}`, month: `mail:g:m:${day.slice(0, 7)}` };
  }

  private async count(key: string): Promise<number> {
    return Number((await this.cache.get(key)) ?? 0);
  }

  /** Zaehler erhoehen und pruefen, ob `max` ueberschritten ist. Cache-Fehler: zulassen (fail open), nur Warnung. */
  private async over(key: string, max: number, ttl: number): Promise<boolean> {
    try {
      return (await this.cache.incr(key, ttl)) > max;
    } catch {
      this.log.warn("Mail-Zaehler nicht erreichbar, Limit wird nicht geprueft.");
      return false;
    }
  }

  /**
   * Globales Kontingent beim Versand: zaehlt eine Mail, wenn noch Platz ist. Bei Cache-Fehler gehen nur wichtige Mails raus.
   * Leichte Ueberschreitung bei parallelen Workern ist moeglich (Lesen und Erhoehen sind getrennt), die Bremse greift trotzdem.
   */
  async takeGlobal(priority: MailPriority, now = new Date()): Promise<boolean> {
    const k = this.keys(now);
    try {
      const [day, month] = await Promise.all([this.count(k.day), this.count(k.month)]);
      if (day >= allowedFor(this.global.daily, priority) || month >= allowedFor(this.global.monthly, priority)) return false;
      await this.cache.incr(k.day, 2 * DAY);
      await this.cache.incr(k.month, 32 * DAY);
      return true;
    } catch {
      this.log.warn("Mail-Kontingent nicht pruefbar.");
      return priority === "critical";
    }
  }

  async status(now = new Date()): Promise<QuotaStatus> {
    const k = this.keys(now);
    const [day, month] = await Promise.all([this.count(k.day).catch(() => 0), this.count(k.month).catch(() => 0)]);
    const d = { used: day, limit: this.global.daily, percent: pct(day, this.global.daily) };
    const m = { used: month, limit: this.global.monthly, percent: pct(month, this.global.monthly) };
    const percent = Math.max(d.percent, m.percent);
    return { day: d, month: m, percent, warning: percent >= MAIL_LIMITS.normalShare * 100 };
  }

  /** Empfaenger: 5/Stunde, 20/Tag. true = Limit erreicht. */
  async recipientOver(hash: string): Promise<boolean> {
    const hour = await this.over(`mail:r:h:${hash}`, MAIL_LIMITS.recipientPerHour, HOUR);
    const day = await this.over(`mail:r:d:${hash}`, MAIL_LIMITS.recipientPerDay, DAY);
    return hour || day;
  }

  /** Ausloesendes Konto: 20/Tag. */
  actorOver(userId: string): Promise<boolean> {
    return this.over(`mail:a:d:${userId}`, MAIL_LIMITS.actorPerDay, DAY);
  }

  /** Einladungs-Mails je Verein: 100/Tag. */
  orgInvitesOver(orgId: string): Promise<boolean> {
    return this.over(`mail:o:d:${orgId}`, MAIL_LIMITS.orgInvitesPerDay, DAY);
  }

  /**
   * Passwort vergessen / Bestaetigung / Registrierung je IP: 5/Stunde, sonst 429 (verraet nichts ueber Konten).
   * Lokale Aufrufe (127.0.0.1/::1: Entwicklung, Tests, Healthchecks) zaehlen nicht; hinter Caddy ist req.ip die echte Client-IP.
   */
  async enforceAuthIp(ip: string | undefined): Promise<void> {
    if (!ip || LOOPBACK.has(ip)) return;
    if (await this.over(`mail:ip:h:${createHmac("sha256", "mail-ip").update(ip).digest("hex")}`, MAIL_LIMITS.authPerIpHour, HOUR)) {
      throw new HttpException({ message: "Zu viele Anfragen. Bitte versuche es in einer Stunde erneut.", statusCode: 429 }, 429);
    }
  }

  /** Je Adresse 3/Stunde. false = Limit erreicht (dann still keine Mail, Antwort bleibt gleich). */
  async authAddressAllowed(email: string): Promise<boolean> {
    return !(await this.over(`mail:addr:h:${addressHash(email)}`, MAIL_LIMITS.authPerAddressHour, HOUR));
  }
}
