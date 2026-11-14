import { createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { CACHE, type Cache } from "../cache/cache.module";
import { SuppressionsService } from "./suppressions.service";

/** Zeitfenster fuer den Zeitstempel (Replay-Schutz zusammen mit der Einmalverwendung der Signatur). */
export const WEBHOOK_TOLERANCE_S = 5 * 60;
export const WEBHOOK_TIMESTAMP_HEADER = "x-klubnest-timestamp";
export const WEBHOOK_SIGNATURE_HEADER = "x-klubnest-signature";

export type BounceKind = "bounce" | "complaint";
export type ParsedBounce = { email: string; reason: BounceKind };

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const str = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

/**
 * Ordnet ein Ereignis des Mail-Anbieters zu. NUR harte Bounces (dauerhaft unzustellbar) und Beschwerden (Spam-Meldung)
 * sperren; weiche/voruebergehende Bounces, Zustellungen, Verzoegerungen und alles Unbekannte werden ignoriert (null).
 * Toleranter Aufbau, weil Anbieter-Formate variieren: Adresse in email/recipient/to, Art in type/event/status,
 * Bounce-Art in bounce_type/bounceType/subtype.
 */
export function classifyEvent(raw: unknown): ParsedBounce | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const email = str(e.email ?? e.recipient ?? e.to ?? e.email_to);
  if (!EMAIL.test(email)) return null;
  const type = [e.type, e.event, e.status].map(str).join(" ");
  if (/complain|spam|abuse/.test(type)) return { email, reason: "complaint" };
  if (/bounce|undeliver|invalid|rejected|dropped/.test(type)) {
    const kind = [e.bounce_type, e.bounceType, e.subtype, e.bounce_subtype, type].map(str).join(" ");
    if (/soft|transient|temporar|delay|defer|mailbox_full|full/.test(kind)) return null;
    if (/hard|permanent|invalid|undeliverable|no_such|unknown_user/.test(kind)) return { email, reason: "bounce" };
  }
  return null;
}

/** Zieht die Ereignisliste aus `[...]`, `{events:[...]}` oder einem einzelnen Objekt. */
export function extractEvents(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const o = body as { events?: unknown; Records?: unknown };
    if (Array.isArray(o.events)) return o.events;
    if (Array.isArray(o.Records)) return o.Records;
    return [body];
  }
  return [];
}

/**
 * Bounce-/Beschwerde-Webhook (Scaleway TEM). Signierter Endpunkt: HMAC-SHA256 ueber `<Zeitstempel>.<Rohkoerper>` mit dem
 * Server-Geheimnis `MAIL_WEBHOOK_SECRET` (nur in /opt/vereine/.env, nie im Repo), Vergleich in konstanter Zeit, Zeitstempel
 * hoechstens 5 Minuten alt, jede Signatur gilt nur einmal (Replay-Schutz im Cache/Redis). Ohne Geheimnis ist der Endpunkt aus (404).
 */
@Injectable()
export class BounceWebhookService {
  private readonly log = new Logger("MailWebhook");

  constructor(
    @Inject(SuppressionsService) private readonly suppressions: SuppressionsService,
    @Inject(CACHE) private readonly cache: Cache,
  ) {}

  private secret(): string | null {
    const s = process.env.MAIL_WEBHOOK_SECRET?.trim();
    return s && s.length >= 32 ? s : null;
  }

  enabled(): boolean {
    return this.secret() !== null;
  }

  /** Signatur, wie sie der Absender berechnen muss (fuer Doku und Tests). */
  static sign(secret: string, timestamp: string, rawBody: string | Buffer): string {
    return createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
  }

  async handle(rawBody: Buffer | undefined, timestamp: string | undefined, signature: string | undefined, now = Date.now()): Promise<{ accepted: number; ignored: number }> {
    const secret = this.secret();
    if (!secret) throw new NotFoundException();
    const bad = new UnauthorizedException("Ungueltige Signatur.");
    if (!rawBody || !timestamp || !signature || !/^\d{9,12}$/.test(timestamp)) throw bad;
    if (Math.abs(now / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_S) throw bad;
    const given = Buffer.from(signature.replace(/^sha256=/, "").toLowerCase(), "utf8");
    const expected = Buffer.from(BounceWebhookService.sign(secret, timestamp, rawBody), "utf8");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw bad;
    // Replay: dieselbe (gueltige) Anfrage hoechstens einmal. Cache weg = Anfrage ablehnen (der Anbieter wiederholt sie).
    const fresh = await this.cache.setNx(`mailhook:${expected.toString("utf8")}`, "1", WEBHOOK_TOLERANCE_S * 2).catch(() => null);
    if (fresh === null) throw new ServiceUnavailableException();
    if (!fresh) throw bad;

    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return { accepted: 0, ignored: 0 };
    }
    let accepted = 0;
    let ignored = 0;
    for (const ev of extractEvents(body).slice(0, 500)) {
      const parsed = classifyEvent(ev);
      if (!parsed) {
        ignored += 1;
        continue;
      }
      await this.suppressions.recordBounce(parsed.email, parsed.reason);
      accepted += 1;
    }
    this.log.log(`Webhook verarbeitet: ${accepted} gesperrt, ${ignored} ignoriert.`);
    return { accepted, ignored };
  }
}
