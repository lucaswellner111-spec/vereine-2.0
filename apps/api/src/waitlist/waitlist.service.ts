import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { and, asc, count, eq, gt, inArray, lt } from "drizzle-orm";
import { WAITLIST_CONSENT_VERSION, type WaitlistEntry, type WaitlistOverview, type WaitlistRole, type WaitlistSignupInput } from "@vereine/shared";
import { CACHE, type Cache } from "../cache/cache.module";
import { appLink } from "../common/app-url";
import { isUniqueViolation } from "../common/pg-errors";
import { ago, purgeInRounds, RETENTION, RETENTION_BATCH } from "../common/retention";
import { derivedKey } from "../common/secret-key";
import { DB, type Database } from "../db/db.module";
import { waitlistEntries } from "../db/schema";
import { addressHash } from "../mail/mail-limits";
import { MailService } from "../mail/mail.service";

export const WAITLIST_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
/** Bestaetigungs-/Hinweismails je Adresse: hoechstens 1 je 10 Minuten und 3 je Tag (danach still keine Mail). */
export const WAITLIST_MAIL_LIMITS = { per10Min: 1, perDay: 3 } as const;

const INVALID_LINK = "Der Link ist ungültig oder abgelaufen.";
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const removeKey = () => derivedKey("waitlist-remove", "Die Warteliste ist auf diesem Server nicht konfiguriert.");
const removeMac = (id: string) => createHmac("sha256", removeKey()).update(id).digest("base64url");

/** Austragelink ohne Ablauf: `<id>.<HMAC>`; gilt, solange der Eintrag existiert. */
export function removeToken(id: string): string {
  return `${id}.${removeMac(id)}`;
}

function verifyRemoveToken(token: string): string | null {
  const [id, mac, extra] = token.split(".");
  if (!id || !mac || extra !== undefined || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const a = Buffer.from(removeMac(id));
  const b = Buffer.from(mac);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

/** CSV-Zelle: Formel-Injection (= + - @ Tab CR am Anfang) mit ' entschaerfen, Trennzeichen/Anfuehrungszeichen quoten. */
export function csvCell(v: string): string {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Warteliste fuer Vereine (Bereich `waitlist`, nur eigene Tabelle). Double-Opt-in: Anmeldung -> Mail mit Einmal-Link
 * (#t=…, nur SHA-256 gespeichert, 48 h) -> Bestaetigung. Die Antwort auf die Anmeldung ist immer gleich; bei bekannter,
 * bestaetigter Adresse geht nur ein Hinweis mit Austragelink raus. Logs nennen nie Adressen.
 */
@Injectable()
export class WaitlistService {
  private readonly log = new Logger("Waitlist");

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CACHE) private readonly cache: Cache,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  /** Je Adresse 1 Mail/10 Min., 3/Tag (Zaehler im Cache, Adresse nur als HMAC). Cache-Fehler: zulassen (MailService bremst weiter). */
  private async mailAllowed(email: string): Promise<boolean> {
    const h = addressHash(email);
    try {
      if ((await this.cache.incr(`lim:wl:addr:10m:${h}`, 600)) > WAITLIST_MAIL_LIMITS.per10Min) return false;
      return (await this.cache.incr(`lim:wl:addr:d:${h}`, 24 * 3600)) <= WAITLIST_MAIL_LIMITS.perDay;
    } catch {
      this.log.warn("Warteliste: Adress-Zaehler nicht erreichbar, Limit wird nicht geprueft.");
      return true;
    }
  }

  async signup(input: WaitlistSignupInput): Promise<void> {
    if (input.website?.trim()) {
      this.log.log("Warteliste: Honeypot ausgeloest, ignoriert.");
      return;
    }
    const [existing] = await this.db.select().from(waitlistEntries).where(eq(waitlistEntries.email, input.email)).limit(1);

    if (existing?.status === "confirmed") {
      // Bekannt: nichts aendern (es gelten die bestaetigten Angaben), nur ein Hinweis mit Austragelink.
      if (await this.mailAllowed(input.email)) {
        await this.mail.send(input.email, "waitlist-exists", { link: appLink("/"), removeLink: this.removeLink(existing.id) });
      }
      return;
    }
    if (!(await this.mailAllowed(input.email))) return; // der Link aus der letzten Mail bleibt gueltig

    const token = randomBytes(32).toString("base64url");
    const values = {
      orgName: input.orgName,
      city: input.city ?? "",
      orgType: input.orgType ?? "",
      role: input.role ?? null,
      tokenHash: sha256(token),
      tokenExpiresAt: new Date(Date.now() + WAITLIST_TOKEN_TTL_MS),
      consentVersion: WAITLIST_CONSENT_VERSION,
      consentAt: new Date(),
      requestedAt: new Date(),
    };
    let id: string;
    if (existing) {
      // Unbestaetigt: neue Angaben ersetzen die alten, nur der neueste Link gilt.
      await this.db.update(waitlistEntries).set(values).where(and(eq(waitlistEntries.id, existing.id), eq(waitlistEntries.status, "pending")));
      id = existing.id;
    } else {
      try {
        [{ id }] = await this.db.insert(waitlistEntries).values({ email: input.email, ...values }).returning({ id: waitlistEntries.id });
      } catch (err) {
        if (isUniqueViolation(err)) return; // gleichzeitige Anmeldung derselben Adresse: die andere Anfrage verschickt die Mail
        throw err;
      }
    }
    await this.mail.send(input.email, "waitlist-confirm", {
      orgName: input.orgName,
      link: appLink(`/warteliste/bestaetigen#t=${token}`),
      validHours: WAITLIST_TOKEN_TTL_MS / 3600_000,
      removeLink: this.removeLink(id),
    });
  }

  private removeLink(id: string) {
    return appLink(`/warteliste/austragen#t=${removeToken(id)}`);
  }

  /** Link aus der Bestaetigungsmail einloesen (atomar, einmalig, 48 h). */
  async confirm(token: string): Promise<void> {
    const [row] = await this.db
      .update(waitlistEntries)
      .set({ status: "confirmed", confirmedAt: new Date(), tokenHash: null, tokenExpiresAt: null })
      .where(and(eq(waitlistEntries.tokenHash, sha256(token)), eq(waitlistEntries.status, "pending"), gt(waitlistEntries.tokenExpiresAt, new Date())))
      .returning({ id: waitlistEntries.id });
    if (!row) throw new BadRequestException(INVALID_LINK);
    this.log.log("Warteliste: Eintrag bestaetigt.");
  }

  /** Austragen/Widerruf: Eintrag sofort loeschen. Schon geloescht = Erfolg (Link darf mehrfach geklickt werden). */
  async remove(token: string): Promise<void> {
    const id = verifyRemoveToken(token);
    if (!id) throw new BadRequestException(INVALID_LINK);
    await this.db.delete(waitlistEntries).where(eq(waitlistEntries.id, id));
    this.log.log("Warteliste: Eintrag ausgetragen.");
  }

  /** Betreiber-Sicht (nur PlatformAdminGuard; den Zugriff protokolliert der Aufrufer). */
  async overview(): Promise<WaitlistOverview> {
    const [counts, entries] = await Promise.all([
      this.db.select({ status: waitlistEntries.status, n: count() }).from(waitlistEntries).groupBy(waitlistEntries.status),
      this.confirmedRows(),
    ]);
    const n = (s: string) => Number(counts.find((c) => c.status === s)?.n ?? 0);
    return { confirmed: n("confirmed"), pending: n("pending"), entries };
  }

  private async confirmedRows(): Promise<WaitlistEntry[]> {
    const rows = await this.db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.status, "confirmed"))
      .orderBy(asc(waitlistEntries.confirmedAt))
      .limit(10_000);
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      orgName: r.orgName,
      city: r.city,
      orgType: r.orgType,
      role: (r.role as WaitlistRole | null) ?? null,
      confirmedAt: r.confirmedAt!.toISOString(),
      consentVersion: r.consentVersion,
    }));
  }

  async exportCsv(): Promise<{ csv: string; count: number }> {
    const rows = await this.confirmedRows();
    const lines = [["E-Mail", "Verein", "Ort", "Vereinsart", "Rolle", "Bestaetigt am", "Einwilligung (Version)"].join(";")];
    for (const r of rows) lines.push([r.email, r.orgName, r.city, r.orgType, r.role ?? "", r.confirmedAt, r.consentVersion].map(csvCell).join(";"));
    return { csv: "﻿" + lines.join("\r\n") + "\r\n", count: rows.length };
  }

  /** Loeschfrist: unbestaetigte Eintraege 7 Tage nach der letzten Anmeldung (Job privacy.retention). */
  purgeExpired(): Promise<number> {
    return purgeInRounds(async () => {
      const ids = this.db
        .select({ id: waitlistEntries.id })
        .from(waitlistEntries)
        .where(and(eq(waitlistEntries.status, "pending"), lt(waitlistEntries.requestedAt, ago(RETENTION.waitlistPending))))
        .limit(RETENTION_BATCH);
      return (await this.db.delete(waitlistEntries).where(inArray(waitlistEntries.id, ids)).returning({ id: waitlistEntries.id })).length;
    });
  }

  /** Datenauskunft eines Kontos (Eintrag mit derselben Adresse), ohne Token-Hash. */
  async exportFor(email: string) {
    const rows = await this.db.select().from(waitlistEntries).where(eq(waitlistEntries.email, email.trim().toLowerCase()));
    return rows.map((r) => ({
      orgName: r.orgName,
      city: r.city,
      orgType: r.orgType,
      role: r.role,
      status: r.status,
      consentVersion: r.consentVersion,
      consentAt: r.consentAt.toISOString(),
      confirmedAt: r.confirmedAt?.toISOString() ?? null,
    }));
  }

  /** Kontoloeschung: ein Eintrag mit der Kontoadresse entfaellt mit. */
  async eraseFor(email: string): Promise<void> {
    await this.db.delete(waitlistEntries).where(eq(waitlistEntries.email, email.trim().toLowerCase()));
  }
}
