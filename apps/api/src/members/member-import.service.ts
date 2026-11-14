import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleInit, PayloadTooLargeException } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import {
  MEMBER_IMPORT_LIMITS,
  memberImportRowSchema,
  type MemberImportField,
  type MemberImportPreview,
  type MemberImportResult,
  type MemberImportRow,
  type PendingMemberItem,
  type PendingMemberPage,
  type PublicUser,
} from "@vereine/shared";
import { AuditService } from "../auth/audit.service";
import { UsersDirectory } from "../auth/users-directory.service";
import { CACHE, type Cache } from "../cache/cache.module";
import { AvvService } from "../avv/avv.service";
import { appLink } from "../common/app-url";
import { berlinDate } from "../common/berlin-date";
import { enforceLimit, limitMessage } from "../common/rate-limit";
import { ago, purgeInRounds, RETENTION, RETENTION_BATCH } from "../common/retention";
import { DB, type Database } from "../db/db.module";
import { feeClasses, pendingMembers } from "../db/schema";
import { JobsService } from "../jobs/jobs.service";
import { addressHash, MAIL_LIMITS } from "../mail/mail-limits";
import { MailLimits } from "../mail/mail-limits";
import { MailService, msUntilNextMorning } from "../mail/mail.service";
import { OrgAdminService } from "../orgs/org-admin.service";
import { OrgEvents } from "../orgs/org-events";
import { OrgsService } from "../orgs/orgs.service";
import { detectDelimiter, mapColumns, parseCsv, parseDate } from "./csv";
import { MembersService } from "./members.service";

const JOB = "members.import-invites";
const FIELD_LABEL: Record<MemberImportField, string> = {
  firstName: "Vorname",
  lastName: "Nachname",
  email: "E-Mail",
  memberNo: "Mitgliedsnummer",
  joinedOn: "Eintrittsdatum",
  feeClass: "Beitragsklasse",
};
/** Haengt ein Versand (Absturz des Workers), gibt der naechste Lauf die Zeile nach dieser Zeit wieder frei. */
const STALE_MS = 15 * 60_000;
/** Nutzungslimits (je Stunde): Pruefungen je Vorstand, Bestaetigungen je Verein. Schuetzt vor Massenabfragen und Mail-Missbrauch. */
export const IMPORT_PREVIEWS_PER_HOUR = 30;
export const IMPORT_CONFIRMS_PER_HOUR = 20;

type ValidRow = { line: number; firstName: string; lastName: string; email: string; memberNo: number | null; joinedOn: string | null; feeClassId: string | null };

/**
 * Mitglieder-Import per CSV (nur Vorstand). Zweistufig: Vorschau (parsen, pruefen, Dubletten) und Bestaetigung (gleiche
 * Datei, wird erneut geprueft). Importierte Personen werden als Vormerkung gespeichert (members.pending_members) und
 * bekommen eine persoenliche Einladung (Job `members.import-invites`). Erst mit dem Beitritt entsteht ein Mitgliedsprofil.
 * DATENSCHUTZ (docs/DATENSCHUTZ-LAUNCH.md): Verantwortlich ist der Verein (Art. 6 Abs. 1 lit. b DSGVO); nur Name,
 * E-Mail, Nummer, Eintritt und Beitragsklasse werden uebernommen, weitere Spalten verworfen. Keine Adressen in Logs
 * oder im Audit (nur Anzahlen).
 * KOSTENBREMSE: Versand ueber MailService.send (Vereinslimit 100 Einladungen/Tag, globales Kontingent); was heute nicht
 * mehr passt, bleibt "queued" und geht am naechsten Morgen raus.
 */
@Injectable()
export class MemberImportService implements OnModuleInit {
  private readonly log = new Logger("MemberImport");

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(OrgAdminService) private readonly invites: OrgAdminService,
    @Inject(OrgEvents) private readonly orgEvents: OrgEvents,
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(MailLimits) private readonly mailLimits: MailLimits,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(CACHE) private readonly cache: Cache,
    @Inject(AvvService) private readonly avv: AvvService,
  ) {}

  onModuleInit() {
    this.jobs.define(JOB, async (d: { orgId: string }) => {
      await this.sendInvites(d.orgId);
    });
    this.orgEvents.onInviteAccepted("member-import", (orgId, userId, inviteId) => this.adopt(orgId, userId, inviteId));
  }

  private async requireAdmin(user: PublicUser, slug: string) {
    const org = await this.orgs.requireBySlug(slug);
    if ((await this.orgs.activeRole(org.id, user.id)) !== "admin") throw new ForbiddenException("Nur der Vorstand darf Mitglieder importieren.");
    return org;
  }

  // --- Datei pruefen --------------------------------------------------------------------------

  private decode(buf: Buffer): string {
    if (buf.length === 0) throw new BadRequestException("Die Datei ist leer.");
    if (buf.length > MEMBER_IMPORT_LIMITS.maxBytes) throw new PayloadTooLargeException("Die Datei ist größer als 1 MB.");
    if ((buf[0] === 0x50 && buf[1] === 0x4b) || buf.includes(0)) {
      throw new BadRequestException("Das ist keine CSV-Datei. Speichere die Tabelle bitte als „CSV (Trennzeichen-getrennt)“.");
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      text = buf.toString("latin1"); // aeltere Excel-Exporte (Windows-1252); Umlaute bleiben lesbar
    }
    return text.replace(/^﻿/, "");
  }

  private async analyze(orgId: string, buf: Buffer): Promise<{ preview: Omit<MemberImportPreview, "mail">; valid: ValidRow[] }> {
    const text = this.decode(buf);
    const delimiter = detectDelimiter(text);
    const records = parseCsv(text, delimiter);
    const header = records[0];
    if (!header) throw new BadRequestException("Die Datei ist leer.");
    const { index, ignored } = mapColumns(header.cells);
    const missing = (["firstName", "lastName", "email"] as const).filter((f) => index[f] === undefined);
    if (missing.length) {
      throw new BadRequestException(`In der Kopfzeile fehlen Spalten: ${missing.map((f) => FIELD_LABEL[f]).join(", ")}. Die erste Zeile muss die Spaltennamen enthalten.`);
    }
    const data = records.slice(1).filter((r) => r.cells.some((c) => c.trim()));
    if (data.length === 0) throw new BadRequestException("Die Datei enthält keine Mitglieder (nur die Kopfzeile).");
    if (data.length > MEMBER_IMPORT_LIMITS.maxRows) {
      throw new BadRequestException(`Höchstens ${MEMBER_IMPORT_LIMITS.maxRows} Mitglieder je Import – deine Datei hat ${data.length}. Bitte teile sie auf.`);
    }

    const [classes, pending, active] = await Promise.all([
      this.db.select({ id: feeClasses.id, name: feeClasses.name }).from(feeClasses).where(eq(feeClasses.orgId, orgId)),
      this.db.select({ email: pendingMembers.email, memberNo: pendingMembers.memberNo }).from(pendingMembers).where(eq(pendingMembers.orgId, orgId)),
      this.orgs.allActiveMembersWithRole(orgId),
    ]);
    const classBy = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c.id]));
    const memberEmails = new Set([...(await this.directory.mailContacts(active.map((a) => a.userId))).values()].map((c) => c.email.toLowerCase()));
    const pendingEmails = new Set(pending.map((p) => p.email));
    const pendingNos = new Set(pending.map((p) => p.memberNo).filter((n): n is number => n !== null));

    const cell = (cells: string[], f: MemberImportField) => (index[f] === undefined ? "" : (cells[index[f]!] ?? "").trim());
    const today = berlinDate();
    const rows: MemberImportRow[] = [];
    const candidates: ValidRow[] = [];
    for (const r of data) {
      const rawNo = cell(r.cells, "memberNo");
      const rawDate = cell(r.cells, "joinedOn");
      const date = parseDate(rawDate);
      const input = {
        firstName: cell(r.cells, "firstName"),
        lastName: cell(r.cells, "lastName"),
        email: cell(r.cells, "email"),
        memberNo: rawNo === "" ? null : /^\d{1,9}$/.test(rawNo) ? Number(rawNo) : Number.NaN,
        joinedOn: date === "invalid" ? "ungueltig" : date,
        feeClassName: cell(r.cells, "feeClass") || null,
      };
      const parsed = memberImportRowSchema.safeParse(input);
      const problems = parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => i.message))];
      let feeClassId: string | null = null;
      if (parsed.success) {
        if (parsed.data.joinedOn && parsed.data.joinedOn > today) problems.push("Eintrittsdatum liegt in der Zukunft.");
        if (parsed.data.feeClassName) {
          feeClassId = classBy.get(parsed.data.feeClassName.toLowerCase()) ?? null;
          if (!feeClassId) problems.push(`Beitragsklasse „${parsed.data.feeClassName}“ gibt es im Verein nicht. Lege sie zuerst unter Beiträge an.`);
        }
      }
      const shown = parsed.success ? parsed.data : input;
      rows.push({
        line: r.line,
        firstName: String(shown.firstName).slice(0, 80),
        lastName: String(shown.lastName).slice(0, 80),
        email: String(shown.email).slice(0, 254),
        memberNo: Number.isFinite(shown.memberNo) ? (shown.memberNo as number | null) : null,
        joinedOn: date === "invalid" ? null : date,
        feeClassName: input.feeClassName?.slice(0, 60) ?? null,
        status: problems.length ? "error" : "ok",
        problems,
      });
      if (parsed.success && problems.length === 0) {
        candidates.push({ line: r.line, firstName: parsed.data.firstName, lastName: parsed.data.lastName, email: parsed.data.email, memberNo: parsed.data.memberNo, joinedOn: parsed.data.joinedOn, feeClassId });
      }
    }

    // Dubletten: in der Datei, gegen Mitglieder, gegen offene Vormerkungen, gegen vergebene Nummern
    const usedNos = await this.members.usedMemberNos(orgId, candidates.map((c) => c.memberNo).filter((n): n is number => n !== null));
    const seenEmail = new Map<string, number>();
    const seenNo = new Map<number, number>();
    const valid: ValidRow[] = [];
    const rowBy = new Map(rows.map((r) => [r.line, r]));
    for (const c of candidates) {
      const dup: string[] = [];
      if (seenEmail.has(c.email)) dup.push(`E-Mail steht schon in Zeile ${seenEmail.get(c.email)}.`);
      else if (memberEmails.has(c.email)) dup.push("Diese Person ist schon Mitglied im Verein.");
      else if (pendingEmails.has(c.email)) dup.push("Diese Person wurde schon importiert und ist eingeladen.");
      if (c.memberNo !== null) {
        if (seenNo.has(c.memberNo)) dup.push(`Mitgliedsnummer ${c.memberNo} steht schon in Zeile ${seenNo.get(c.memberNo)}.`);
        else if (usedNos.has(c.memberNo) || pendingNos.has(c.memberNo)) dup.push(`Mitgliedsnummer ${c.memberNo} ist im Verein schon vergeben.`);
      }
      if (!seenEmail.has(c.email)) seenEmail.set(c.email, c.line);
      if (c.memberNo !== null && !seenNo.has(c.memberNo)) seenNo.set(c.memberNo, c.line);
      if (dup.length) {
        const row = rowBy.get(c.line)!;
        row.status = "duplicate";
        row.problems = dup;
      } else valid.push(c);
    }

    const columns = (Object.keys(FIELD_LABEL) as MemberImportField[])
      .filter((f) => index[f] !== undefined)
      .map((f) => ({ field: f, header: header.cells[index[f]!].trim().slice(0, 60) }));
    return {
      preview: {
        delimiter,
        columns,
        ignoredColumns: ignored,
        total: rows.length,
        valid: valid.length,
        errors: rows.filter((r) => r.status === "error").length,
        duplicates: rows.filter((r) => r.status === "duplicate").length,
        rows,
      },
      valid,
    };
  }

  /** Wie viele der `n` neuen Einladungen heute noch rausgehen (vor ihnen wartende zaehlen mit). */
  private async mailSplit(orgId: string, n: number): Promise<{ today: number; later: number }> {
    const [capacity, [{ queued }]] = await Promise.all([
      this.mailLimits.inviteCapacityToday(orgId),
      this.db.select({ queued: count() }).from(pendingMembers).where(and(eq(pendingMembers.orgId, orgId), eq(pendingMembers.status, "queued"))),
    ]);
    const today = Math.max(0, Math.min(n, capacity - Number(queued)));
    return { today, later: n - today };
  }

  async preview(user: PublicUser, slug: string, file: Buffer): Promise<MemberImportPreview> {
    const org = await this.requireAdmin(user, slug);
    await enforceLimit(this.cache, `import:prev:${org.id}:${user.id}`, IMPORT_PREVIEWS_PER_HOUR, 3600, limitMessage("Import-Prüfungen"));
    const { preview } = await this.analyze(org.id, file);
    return { ...preview, mail: await this.mailSplit(org.id, preview.valid) };
  }

  async confirm(user: PublicUser, slug: string, file: Buffer): Promise<MemberImportResult> {
    const org = await this.requireAdmin(user, slug);
    await enforceLimit(this.cache, `import:conf:${org.id}`, IMPORT_CONFIRMS_PER_HOUR, 3600, limitMessage("Importe"));
    await this.avv.assertAccepted(org.id); // Mitgliederdaten und Einladungsmails im Auftrag des Vereins
    const { preview, valid } = await this.analyze(org.id, file);
    if (valid.length === 0) throw new BadRequestException("Die Datei enthält keine gültigen neuen Mitglieder.");
    const [{ open }] = await this.db.select({ open: count() }).from(pendingMembers).where(eq(pendingMembers.orgId, org.id));
    if (Number(open) + valid.length > MEMBER_IMPORT_LIMITS.maxPendingPerOrg) {
      throw new BadRequestException(`Es sind schon ${open} Personen eingeladen, aber noch nicht beigetreten. Mehr als ${MEMBER_IMPORT_LIMITS.maxPendingPerOrg} offene Einladungen sind nicht möglich.`);
    }
    const split = await this.mailSplit(org.id, valid.length);
    const inserted = await this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(pendingMembers)
        .values(valid.map((v) => ({ orgId: org.id, firstName: v.firstName, lastName: v.lastName, email: v.email, memberNo: v.memberNo, joinedOn: v.joinedOn, feeClassId: v.feeClassId, createdBy: user.id })))
        .onConflictDoNothing() // paralleler Import derselben Datei: Dubletten still auslassen
        .returning({ id: pendingMembers.id, memberNo: pendingMembers.memberNo });
      const maxNo = Math.max(0, ...rows.map((r) => r.memberNo ?? 0));
      if (maxNo > 0) await this.members.reserveMemberNos(org.id, maxNo, tx as unknown as Database);
      return rows.length;
    });
    await this.audit.record(user.id, "members.imported", { orgId: org.id, count: inserted, skipped: preview.total - inserted });
    // Versand im Worker (BullMQ); lokal/Tests laeuft der Job sofort im selben Prozess.
    await this.jobs.enqueue(JOB, { orgId: org.id }, { attempts: 3, backoffMs: 60_000 });
    const mailToday = Math.min(split.today, inserted);
    return { imported: inserted, skipped: preview.total - inserted, mailToday, mailLater: inserted - mailToday };
  }

  // --- Versand (Job) ----------------------------------------------------------------------------

  /** Verschickt wartende Einladungen eines Vereins bis zum Tageslimit; der Rest folgt am naechsten Morgen. */
  async sendInvites(orgId: string): Promise<{ sent: number; remaining: number }> {
    const org = (await this.orgs.lookupByIds([orgId])).get(orgId);
    if (!org) return { sent: 0, remaining: 0 };
    // AVV nicht (mehr) akzeptiert: nichts verschicken, Zeilen bleiben "queued" und gehen nach der Zustimmung raus.
    try {
      await this.avv.assertAccepted(orgId);
    } catch (err) {
      if (err instanceof ForbiddenException) {
        const [{ waiting: n }] = await this.db.select({ waiting: count() }).from(pendingMembers).where(and(eq(pendingMembers.orgId, orgId), eq(pendingMembers.status, "queued")));
        if (Number(n) > 0) await this.jobs.enqueue(JOB, { orgId }, { delayMs: msUntilNextMorning(), attempts: 3, backoffMs: 60_000 }); // spaeter erneut versuchen
        return { sent: 0, remaining: Number(n) };
      }
      throw err;
    }
    const stale = new Date(Date.now() - STALE_MS);
    const waiting = or(eq(pendingMembers.status, "queued"), and(eq(pendingMembers.status, "sending"), lt(pendingMembers.sentAt, stale)));
    const batch = await this.db
      .select({ id: pendingMembers.id })
      .from(pendingMembers)
      .where(and(eq(pendingMembers.orgId, orgId), waiting))
      .orderBy(asc(pendingMembers.createdAt))
      .limit(MAIL_LIMITS.orgInvitesPerDay);
    let sent = 0;
    for (const { id } of batch) {
      // Zeile atomar beanspruchen (parallele Jobs desselben Vereins verschicken nie doppelt)
      const [row] = await this.db
        .update(pendingMembers)
        .set({ status: "sending", sentAt: new Date() })
        .where(and(eq(pendingMembers.id, id), waiting))
        .returning();
      if (!row) continue;
      const invite = await this.invites.createImportInvite(orgId, row.createdBy, MEMBER_IMPORT_LIMITS.inviteValidDays);
      let result: Awaited<ReturnType<MailService["send"]>>;
      try {
        result = await this.mail.send(
          row.email,
          "member-invite",
          { orgName: org.name, firstName: row.firstName, link: appLink(`/einladung/${invite.token}`), validDays: MEMBER_IMPORT_LIMITS.inviteValidDays },
          { orgId, unsubscribe: { k: "invite", h: addressHash(row.email) } },
        );
      } catch (err) {
        await this.invites.revokeImportInvites(orgId, [invite.id], { delete: true });
        await this.db.update(pendingMembers).set({ status: "queued", sentAt: null }).where(eq(pendingMembers.id, row.id));
        throw err;
      }
      if (result === "queued" || result === "suppressed") {
        // Abgemeldete Adressen zaehlen still als verschickt: der Vorstand erfaehrt nicht, wer sich abgemeldet hat.
        const [kept] = await this.db
          .update(pendingMembers)
          .set({ status: "sent", inviteId: invite.id, sentAt: new Date(), inviteExpiresAt: invite.expiresAt })
          .where(eq(pendingMembers.id, row.id))
          .returning({ id: pendingMembers.id });
        // Vorstand hat die Vormerkung waehrend des Versands entfernt: Einladung sofort widerrufen (Link wirkungslos).
        if (!kept) await this.invites.revokeImportInvites(orgId, [invite.id]);
        sent++;
        continue;
      }
      await this.invites.revokeImportInvites(orgId, [invite.id], { delete: true });
      await this.db.update(pendingMembers).set({ status: "queued", sentAt: null }).where(eq(pendingMembers.id, row.id));
      if (result === "limited:org") break; // Tageslimit des Vereins erreicht
    }
    const [{ remaining }] = await this.db
      .select({ remaining: count() })
      .from(pendingMembers)
      .where(and(eq(pendingMembers.orgId, orgId), eq(pendingMembers.status, "queued")));
    if (Number(remaining) > 0) {
      await this.jobs.enqueue(JOB, { orgId }, { delayMs: msUntilNextMorning(), attempts: 3, backoffMs: 60_000 });
    }
    this.log.log(`Import-Einladungen: ${sent} eingereiht, ${remaining} warten.`);
    return { sent, remaining: Number(remaining) };
  }

  // --- Beitritt -----------------------------------------------------------------------------

  /** Persoenliche Einladung angenommen: Stammdaten uebernehmen, Vormerkung loeschen (Datenminimierung). */
  private async adopt(orgId: string, userId: string, inviteId: string): Promise<void> {
    const [row] = await this.db
      .select()
      .from(pendingMembers)
      .where(and(eq(pendingMembers.orgId, orgId), eq(pendingMembers.inviteId, inviteId)))
      .limit(1);
    if (!row) return;
    await this.members.applyImported(orgId, userId, { memberNo: row.memberNo, joinedOn: row.joinedOn, feeClassId: row.feeClassId });
    await this.db.delete(pendingMembers).where(eq(pendingMembers.id, row.id));
  }

  // --- Vormerkungen (Liste fuer den Vorstand) -----------------------------------------------------

  async listPending(user: PublicUser, slug: string, q: { limit?: number; offset?: number }): Promise<PendingMemberPage> {
    const org = await this.requireAdmin(user, slug);
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
    const offset = Math.max(q.offset ?? 0, 0);
    const [[{ total }], rows, classes] = await Promise.all([
      this.db.select({ total: count() }).from(pendingMembers).where(eq(pendingMembers.orgId, org.id)),
      this.db.select().from(pendingMembers).where(eq(pendingMembers.orgId, org.id)).orderBy(desc(pendingMembers.createdAt), asc(pendingMembers.lastName)).limit(limit).offset(offset),
      this.db.select({ id: feeClasses.id, name: feeClasses.name }).from(feeClasses).where(eq(feeClasses.orgId, org.id)),
    ]);
    const classBy = new Map(classes.map((c) => [c.id, c.name]));
    const now = Date.now();
    const items: PendingMemberItem[] = rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      memberNo: r.memberNo,
      joinedOn: r.joinedOn,
      feeClassName: r.feeClassId ? classBy.get(r.feeClassId) ?? null : null,
      status: r.status === "sent" ? (r.inviteExpiresAt && r.inviteExpiresAt.getTime() <= now ? "expired" : "sent") : "queued",
      sentAt: r.status === "sent" && r.sentAt ? r.sentAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
    return { total: Number(total), items };
  }

  /** Vormerkung entfernen: Einladung widerrufen, Daten loeschen. */
  async removePending(user: PublicUser, slug: string, id: string): Promise<void> {
    const org = await this.requireAdmin(user, slug);
    const [row] = await this.db.delete(pendingMembers).where(and(eq(pendingMembers.id, id), eq(pendingMembers.orgId, org.id))).returning();
    if (!row) throw new NotFoundException("Eintrag nicht gefunden.");
    if (row.inviteId) await this.invites.revokeImportInvites(org.id, [row.inviteId]);
    await this.audit.record(user.id, "members.import.removed", { orgId: org.id, pendingId: id });
  }

  // --- Loeschfristen ------------------------------------------------------------------------------

  /** Versendete Vormerkungen bei Ablauf der Einladung, nie versendete nach 60 Tagen loeschen (Job privacy.retention). */
  purgeExpired(): Promise<number> {
    return purgeInRounds(async () => {
      const ids = this.db
        .select({ id: pendingMembers.id })
        .from(pendingMembers)
        .where(
          or(
            and(isNotNull(pendingMembers.inviteExpiresAt), lt(pendingMembers.inviteExpiresAt, sql`now()`)),
            and(isNull(pendingMembers.inviteExpiresAt), lt(pendingMembers.createdAt, ago(RETENTION.pendingMembersUnsent))),
          ),
        )
        .limit(RETENTION_BATCH);
      const gone = await this.db.delete(pendingMembers).where(inArray(pendingMembers.id, ids)).returning({ id: pendingMembers.id });
      return gone.length;
    });
  }
}
