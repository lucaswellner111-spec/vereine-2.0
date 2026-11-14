import { createHash } from "node:crypto";
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import {
  AVV_DOCUMENT,
  AVV_GRACE_DAYS,
  AVV_VERSIONS,
  avvToMarkdown,
  type AvvAcceptInput,
  type AvvAcceptanceInfo,
  type AvvDocument,
  type AvvStatus,
} from "@vereine/shared";
import { AuditService } from "../auth/audit.service";
import { UsersDirectory } from "../auth/users-directory.service";
import { berlinDate } from "../common/berlin-date";
import { DB, type Database } from "../db/db.module";
import { avvAcceptances } from "../db/schema";

export const avvHash = (doc: AvvDocument) => createHash("sha256").update(avvToMarkdown(doc), "utf8").digest("hex");

/** Letzter Tag der Uebergangsfrist nach Veroeffentlichung der aktuellen Fassung (Berliner Datum, JJJJ-MM-TT). */
export function avvGraceUntil(doc: AvvDocument = AVV_DOCUMENT): string {
  const d = new Date(`${doc.publishedAt}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + AVV_GRACE_DAYS);
  return d.toISOString().slice(0, 10);
}

/** Wird die Zustimmung erzwungen? Standard aus (Tests/E2E/Vorschau), in Produktion spaeter per AVV_REQUIRED=true. */
export const avvRequired = () => process.env.AVV_REQUIRED === "true";

/**
 * AVV-Akzeptanz (Bereich `avv`, nur eigene Tabelle). Append-only: Zustimmungen werden nur eingefuegt; bei Kontoloeschung
 * wird allein die Person entkoppelt (`accepted_by` leer, Trigger sperrt alles andere). KEINE IP-Adresse.
 * Rechte (nur Vorstand) prueft der Controller; Schreibdienste anderer Bereiche rufen nur `assertAccepted(orgId)` auf.
 */
@Injectable()
export class AvvService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
  ) {}

  private async rows(orgId: string) {
    return this.db.select().from(avvAcceptances).where(eq(avvAcceptances.orgId, orgId)).orderBy(desc(avvAcceptances.acceptedAt));
  }

  /** Durchsetzung: wirft 403 (code avv_required), wenn AVV_REQUIRED an ist und der Verein nicht (mehr) zugestimmt hat. */
  async assertAccepted(orgId: string): Promise<void> {
    if (!avvRequired()) return;
    const rows = await this.rows(orgId);
    if (rows.some((r) => r.version === AVV_DOCUMENT.version && r.textHash === avvHash(AVV_DOCUMENT))) return;
    // Aeltere Fassung akzeptiert: bis Fristende weiterarbeiten (kein Sperren ueber Nacht)
    if (rows.length > 0 && berlinDate() <= avvGraceUntil()) return;
    throw new ForbiddenException({
      statusCode: 403,
      code: "avv_required",
      message:
        rows.length > 0
          ? "Der Vertrag zur Auftragsverarbeitung wurde aktualisiert. Der Vorstand muss der neuen Fassung unter Verwaltung → Vertrag zur Auftragsverarbeitung zustimmen."
          : "Dafür braucht dein Verein einen Vertrag zur Auftragsverarbeitung. Der Vorstand kann ihm unter Verwaltung → Vertrag zur Auftragsverarbeitung zustimmen.",
    });
  }

  async status(orgId: string, canAccept: boolean): Promise<AvvStatus> {
    const rows = await this.rows(orgId);
    const hash = avvHash(AVV_DOCUMENT);
    const latest = rows[0];
    const names = latest?.acceptedBy ? await this.directory.names([latest.acceptedBy]) : new Map<string, string>();
    const accepted: AvvAcceptanceInfo | null = latest
      ? {
          version: latest.version,
          textHash: latest.textHash,
          acceptedAt: latest.acceptedAt.toISOString(),
          acceptedBy: latest.acceptedBy ? (names.get(latest.acceptedBy) ?? null) : null,
          isCurrent: latest.version === AVV_DOCUMENT.version && latest.textHash === hash,
        }
      : null;
    const upToDate = !!accepted?.isCurrent;
    const inGrace = !upToDate && !!latest && berlinDate() <= avvGraceUntil();
    return {
      required: avvRequired(),
      current: { version: AVV_DOCUMENT.version, textHash: hash, status: AVV_DOCUMENT.status, title: AVV_DOCUMENT.title, publishedAt: AVV_DOCUMENT.publishedAt },
      accepted,
      upToDate,
      blocked: avvRequired() && !upToDate && !inGrace,
      graceUntil: !upToDate && latest ? avvGraceUntil() : null,
      canAccept,
    };
  }

  /** Zustimmung des Vorstands; idempotent je Fassung (zweites Mal aendert nichts). */
  async accept(orgId: string, userId: string, input: AvvAcceptInput): Promise<void> {
    if (input.version !== AVV_DOCUMENT.version || input.textHash !== avvHash(AVV_DOCUMENT)) {
      throw new ConflictException("Der Vertragstext wurde inzwischen aktualisiert. Bitte lade die Seite neu und lies die neue Fassung.");
    }
    const inserted = await this.db
      .insert(avvAcceptances)
      .values({ orgId, version: AVV_DOCUMENT.version, textHash: input.textHash, acceptedBy: userId })
      .onConflictDoNothing()
      .returning({ id: avvAcceptances.id });
    if (inserted.length > 0) await this.audit.record(userId, "avv.accepted", { orgId, version: AVV_DOCUMENT.version }); // ohne Text
  }

  /** Text einer Fassung (Download). Ohne Angabe: die zuletzt akzeptierte, sonst die aktuelle Fassung. */
  async document(orgId: string, version?: string): Promise<{ doc: AvvDocument; hash: string; accepted: boolean }> {
    const rows = await this.rows(orgId);
    const wanted = version ?? rows[0]?.version ?? AVV_DOCUMENT.version;
    const doc = AVV_VERSIONS.find((d) => d.version === wanted);
    if (!doc) throw new NotFoundException("Diese Fassung des Vertrags gibt es nicht.");
    const row = rows.find((r) => r.version === wanted);
    return { doc, hash: row?.textHash ?? avvHash(doc), accepted: !!row };
  }

  // --- Datenschutz --------------------------------------------------------------------

  /** Auskunft: Zustimmungen, die diese Person fuer Vereine abgegeben hat (Vereins-ID, Fassung, Pruefsumme, Zeitpunkt). */
  async exportFor(userId: string) {
    const rows = await this.db.select().from(avvAcceptances).where(eq(avvAcceptances.acceptedBy, userId));
    return rows.map((r) => ({ orgId: r.orgId, version: r.version, textHash: r.textHash, at: r.acceptedAt.toISOString() }));
  }

  /** Kontoloeschung: Person entkoppeln; der Nachweis (Verein, Fassung, Zeitpunkt, Pruefsumme) bleibt. */
  async eraseUser(userId: string): Promise<void> {
    await this.db.update(avvAcceptances).set({ acceptedBy: null }).where(eq(avvAcceptances.acceptedBy, userId));
  }
}
