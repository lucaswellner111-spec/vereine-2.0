import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type {
  AdminMemberProfileInput,
  FeeClassInput,
  FeeClassItem,
  MemberRecord,
  MemberRegistryItem,
  MemberRegistryPage,
  MyMembership,
  OrgRole,
  PublicUser,
  SelfMemberProfileInput,
} from "@vereine/shared";
import { AuditService } from "../auth/audit.service";
import { UsersDirectory } from "../auth/users-directory.service";
import { DB, type Database } from "../db/db.module";
import { feeClasses, memberCounters, memberProfiles, pendingMembers } from "../db/schema";
import { OrgEvents } from "../orgs/org-events";
import { OrgsService } from "../orgs/orgs.service";
import { berlinDate } from "../common/berlin-date";
import { ProfileAccess } from "../profiles/profile-access.service";
import { isUniqueViolation } from "../common/pg-errors";

type ProfileRow = typeof memberProfiles.$inferSelect;
const READERS: OrgRole[] = ["admin", "treasurer"];
const DELETED = "Gelöschtes Mitglied";
const today = () => berlinDate();

function isMinor(birthDate: string | null): boolean | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const t = new Date();
  let age = t.getUTCFullYear() - b.getUTCFullYear();
  if (t.getUTCMonth() < b.getUTCMonth() || (t.getUTCMonth() === b.getUTCMonth() && t.getUTCDate() < b.getUTCDate())) age -= 1;
  return age < 18;
}

/**
 * Mitgliederverwaltung (Bereich `members`): Stammdaten, Mitgliedsnummern, Beitragsklassen.
 * DATENSCHUTZ (docs/DATENSCHUTZ-LAUNCH.md, Abschnitt 4): Vorstand/Kassenwart lesen, nur der Vorstand aendert;
 * jedes Mitglied pflegt seine eigenen Daten. Beim Austritt werden alle personenbezogenen Felder geleert,
 * bei Kontoloeschung die Zeilen entfernt. Der Export wird protokolliert.
 * SKALIERUNG: Die Liste laedt alle aktiven Mitglieder (blockweise, ohne feste Grenze) und filtert im Speicher (Namen
 * kommen aus dem Bereich identity). Bei sehr grossen Vereinen: Suche ueber UsersDirectory + Seitenweise Abfrage in der DB.
 */
@Injectable()
export class MembersService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
    @Inject(OrgEvents) private readonly orgEvents: OrgEvents,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ProfileAccess) private readonly access: ProfileAccess,
  ) {}

  onModuleInit() {
    this.orgEvents.onLeave("members", (orgId, userId) => this.anonymizeOnLeave(orgId, userId));
    this.orgEvents.onOrgDeleted("members", (orgId) => this.eraseOrg(orgId));
  }

  // --- Zugriff ------------------------------------------------------------------

  private async requireRole(user: PublicUser, slug: string, allowed: OrgRole[]) {
    const org = await this.orgs.requireBySlug(slug);
    const role = await this.orgs.activeRole(org.id, user.id);
    if (!role || !allowed.includes(role)) {
      throw new ForbiddenException(allowed.length === 1 ? "Nur der Vorstand darf das." : "Nur Vorstand und Kassenwart haben Zugriff auf die Mitgliederdaten.");
    }
    return org;
  }

  // --- Profile anlegen / Mitgliedsnummern --------------------------------------------

  /** Stellt sicher, dass jedes aktive Mitglied ein Profil mit Nummer hat (idempotent); reaktiviert Wiedereintritte. */
  private async ensureProfiles(orgId: string): Promise<void> {
    const active = await this.orgs.allActiveMembersWithRole(orgId);
    if (active.length === 0) return;
    const existing = await this.db.select().from(memberProfiles).where(eq(memberProfiles.orgId, orgId));
    const byUser = new Map(existing.map((p) => [p.userId, p]));
    const rejoined = active.filter((a) => byUser.get(a.userId)?.leftOn);
    if (rejoined.length) {
      await this.db
        .update(memberProfiles)
        .set({ leftOn: null, joinedOn: today(), updatedAt: new Date() })
        .where(and(eq(memberProfiles.orgId, orgId), inArray(memberProfiles.userId, rejoined.map((r) => r.userId))));
    }
    const missing = active.filter((a) => !byUser.has(a.userId));
    if (missing.length === 0) return;
    await this.db.transaction(async (tx) => {
      // Atomarer Zaehler: bei parallelen Aufrufen bekommt jeder einen eigenen, lueckenlosen Nummernblock.
      const [counter] = await tx
        .insert(memberCounters)
        .values({ orgId, lastNo: missing.length })
        .onConflictDoUpdate({ target: memberCounters.orgId, set: { lastNo: sql`${memberCounters.lastNo} + ${missing.length}` } })
        .returning({ lastNo: memberCounters.lastNo });
      const first = counter.lastNo - missing.length + 1;
      await tx
        .insert(memberProfiles)
        .values(missing.map((m, i) => ({ orgId, userId: m.userId, memberNo: first + i, joinedOn: berlinDate(m.since) })))
        .onConflictDoNothing();
    });
  }

  // --- Mitgliederliste ----------------------------------------------------------------

  async list(user: PublicUser, slug: string, q: { q?: string; feeClassId?: string; limit?: number; offset?: number }): Promise<MemberRegistryPage> {
    const org = await this.requireRole(user, slug, READERS);
    await this.ensureProfiles(org.id);
    const [active, profiles, classes] = await Promise.all([
      this.orgs.allActiveMembersWithRole(org.id),
      this.db.select().from(memberProfiles).where(and(eq(memberProfiles.orgId, org.id), isNull(memberProfiles.leftOn))),
      this.db.select().from(feeClasses).where(eq(feeClasses.orgId, org.id)),
    ]);
    const names = await this.directory.names(active.map((a) => a.userId));
    const roleBy = new Map(active.map((a) => [a.userId, a.role]));
    const classBy = new Map(classes.map((c) => [c.id, c.name]));
    const term = q.q?.trim().toLowerCase();
    let items: MemberRegistryItem[] = profiles
      .filter((p) => roleBy.has(p.userId))
      .map((p) => ({
        userId: p.userId,
        name: names.get(p.userId) ?? DELETED,
        handle: null,
        memberNo: p.memberNo,
        role: roleBy.get(p.userId)!,
        joinedOn: p.joinedOn,
        feeClassId: p.feeClassId,
        feeClassName: p.feeClassId ? classBy.get(p.feeClassId) ?? null : null,
        city: p.city,
        minor: isMinor(p.birthDate),
      }));
    if (q.feeClassId) items = items.filter((i) => i.feeClassId === q.feeClassId);
    if (term) items = items.filter((i) => i.name.toLowerCase().includes(term) || String(i.memberNo) === term || i.city.toLowerCase().includes(term));
    items.sort((a, b) => a.name.localeCompare(b.name, "de"));
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
    const offset = Math.max(q.offset ?? 0, 0);
    const page = items.slice(offset, offset + limit);
    const handles = await this.access.handles(page.map((i) => i.userId)); // nur fuer die angezeigte Seite
    return { total: items.length, items: page.map((i) => ({ ...i, handle: handles.get(i.userId) ?? null })) };
  }

  private async record(orgId: string, userId: string): Promise<MemberRecord> {
    const [p] = await this.db
      .select()
      .from(memberProfiles)
      .where(and(eq(memberProfiles.orgId, orgId), eq(memberProfiles.userId, userId), isNull(memberProfiles.leftOn)))
      .limit(1);
    const role = await this.orgs.activeRole(orgId, userId);
    if (!p || !role) throw new NotFoundException("Mitglied nicht gefunden.");
    const names = await this.directory.names([userId]);
    return {
      userId,
      name: names.get(userId) ?? DELETED,
      memberNo: p.memberNo,
      role,
      joinedOn: p.joinedOn,
      feeClassId: p.feeClassId,
      notes: p.notes,
      street: p.street,
      zip: p.zip,
      city: p.city,
      phone: p.phone,
      birthDate: p.birthDate ?? "",
      guardianName: p.guardianName,
      guardianEmail: p.guardianEmail,
      minor: isMinor(p.birthDate),
    };
  }

  async get(user: PublicUser, slug: string, userId: string): Promise<MemberRecord> {
    const org = await this.requireRole(user, slug, READERS);
    await this.ensureProfiles(org.id);
    return this.record(org.id, userId);
  }

  async update(user: PublicUser, slug: string, userId: string, input: AdminMemberProfileInput): Promise<MemberRecord> {
    const org = await this.requireRole(user, slug, ["admin"]);
    await this.ensureProfiles(org.id);
    if (input.feeClassId) await this.requireClass(org.id, input.feeClassId);
    const res = await this.db
      .update(memberProfiles)
      .set({ ...this.personalFields(input), feeClassId: input.feeClassId, joinedOn: input.joinedOn, notes: input.notes, updatedAt: new Date() })
      .where(and(eq(memberProfiles.orgId, org.id), eq(memberProfiles.userId, userId), isNull(memberProfiles.leftOn)))
      .returning({ id: memberProfiles.userId });
    if (res.length === 0) throw new NotFoundException("Mitglied nicht gefunden.");
    await this.audit.record(user.id, "member.profile.updated", { orgId: org.id, memberId: userId }); // ohne Inhalte
    return this.record(org.id, userId);
  }

  private personalFields(i: SelfMemberProfileInput) {
    return {
      street: i.street,
      zip: i.zip,
      city: i.city,
      phone: i.phone,
      birthDate: i.birthDate || null,
      guardianName: i.guardianName,
      guardianEmail: i.guardianEmail,
    };
  }

  // --- Selbstverwaltung ---------------------------------------------------------------

  async myMemberships(user: PublicUser): Promise<MyMembership[]> {
    const rows = await this.db.select().from(memberProfiles).where(and(eq(memberProfiles.userId, user.id), isNull(memberProfiles.leftOn)));
    const [orgs, classes] = await Promise.all([
      this.orgs.lookupByIds(rows.map((r) => r.orgId)),
      this.db.select().from(feeClasses).where(inArray(feeClasses.orgId, rows.length ? rows.map((r) => r.orgId) : [user.id])),
    ]);
    const classBy = new Map(classes.map((c) => [c.id, c.name]));
    return rows
      .filter((r) => orgs.has(r.orgId))
      .map((r) => ({
        orgSlug: orgs.get(r.orgId)!.slug,
        orgName: orgs.get(r.orgId)!.name,
        memberNo: r.memberNo,
        joinedOn: r.joinedOn,
        feeClassName: r.feeClassId ? classBy.get(r.feeClassId) ?? null : null,
        profile: { street: r.street, zip: r.zip, city: r.city, phone: r.phone, birthDate: r.birthDate ?? "", guardianName: r.guardianName, guardianEmail: r.guardianEmail },
      }));
  }

  async myProfile(user: PublicUser, slug: string): Promise<MyMembership> {
    const org = await this.orgs.requireBySlug(slug);
    if (!(await this.orgs.activeRole(org.id, user.id))) throw new ForbiddenException("Du bist kein Mitglied dieses Vereins.");
    await this.ensureProfiles(org.id);
    const mine = (await this.myMemberships(user)).find((m) => m.orgSlug === slug);
    if (!mine) throw new NotFoundException("Profil nicht gefunden.");
    return mine;
  }

  async updateMyProfile(user: PublicUser, slug: string, input: SelfMemberProfileInput): Promise<MyMembership> {
    const org = await this.orgs.requireBySlug(slug);
    if (!(await this.orgs.activeRole(org.id, user.id))) throw new ForbiddenException("Du bist kein Mitglied dieses Vereins.");
    await this.ensureProfiles(org.id);
    await this.db
      .update(memberProfiles)
      .set({ ...this.personalFields(input), updatedAt: new Date() })
      .where(and(eq(memberProfiles.orgId, org.id), eq(memberProfiles.userId, user.id)));
    return this.myProfile(user, slug);
  }

  // --- Beitragsklassen ------------------------------------------------------------------

  private async requireClass(orgId: string, id: string) {
    const [c] = await this.db.select().from(feeClasses).where(and(eq(feeClasses.id, id), eq(feeClasses.orgId, orgId))).limit(1);
    if (!c) throw new BadRequestException("Diese Beitragsklasse gehört nicht zum Verein.");
    return c;
  }

  async listClasses(user: PublicUser, slug: string): Promise<FeeClassItem[]> {
    const org = await this.requireRole(user, slug, READERS);
    const [classes, counts] = await Promise.all([
      this.db.select().from(feeClasses).where(eq(feeClasses.orgId, org.id)).orderBy(asc(feeClasses.name)),
      this.db
        .select({ id: memberProfiles.feeClassId, n: sql<number>`count(*)::int` })
        .from(memberProfiles)
        .where(and(eq(memberProfiles.orgId, org.id), isNull(memberProfiles.leftOn), isNotNull(memberProfiles.feeClassId)))
        .groupBy(memberProfiles.feeClassId),
    ]);
    const countBy = new Map(counts.map((c) => [c.id, c.n]));
    return classes.map((c) => ({ id: c.id, name: c.name, amountCents: c.amountCents, interval: c.interval as FeeClassItem["interval"], description: c.description, members: countBy.get(c.id) ?? 0 }));
  }

  private async saveClass(orgId: string, input: FeeClassInput, id?: string) {
    try {
      if (id) {
        const res = await this.db.update(feeClasses).set(input).where(and(eq(feeClasses.id, id), eq(feeClasses.orgId, orgId))).returning({ id: feeClasses.id });
        if (res.length === 0) throw new NotFoundException("Beitragsklasse nicht gefunden.");
      } else {
        const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(feeClasses).where(eq(feeClasses.orgId, orgId));
        if (n >= 30) throw new BadRequestException("Mehr als 30 Beitragsklassen sind nicht möglich.");
        await this.db.insert(feeClasses).values({ orgId, ...input });
      }
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException("Eine Beitragsklasse mit diesem Namen gibt es schon.");
      throw err;
    }
  }

  async createClass(user: PublicUser, slug: string, input: FeeClassInput): Promise<FeeClassItem[]> {
    const org = await this.requireRole(user, slug, ["admin"]);
    await this.saveClass(org.id, input);
    return this.listClasses(user, slug);
  }

  async updateClass(user: PublicUser, slug: string, id: string, input: FeeClassInput): Promise<FeeClassItem[]> {
    const org = await this.requireRole(user, slug, ["admin"]);
    await this.saveClass(org.id, input, id);
    return this.listClasses(user, slug);
  }

  async deleteClass(user: PublicUser, slug: string, id: string): Promise<void> {
    const org = await this.requireRole(user, slug, ["admin"]);
    const res = await this.db.delete(feeClasses).where(and(eq(feeClasses.id, id), eq(feeClasses.orgId, org.id))).returning({ id: feeClasses.id });
    if (res.length === 0) throw new NotFoundException("Beitragsklasse nicht gefunden.");
  }

  // --- Beitragslauf (schmale Lesewege fuer den Bereich billing) ---------------------------

  /** Beitragsklassen eines Vereins (ohne Rechtepruefung, nur fuer interne Dienste). */
  async feeClassesOf(orgId: string, ids?: string[]): Promise<{ id: string; name: string; amountCents: number }[]> {
    const conds = [eq(feeClasses.orgId, orgId)];
    if (ids) {
      if (ids.length === 0) return [];
      conds.push(inArray(feeClasses.id, ids));
    }
    return this.db.select({ id: feeClasses.id, name: feeClasses.name, amountCents: feeClasses.amountCents }).from(feeClasses).where(and(...conds));
  }

  /**
   * Kandidaten eines Beitragslaufs: aktive Mitglieder (ohne leftOn, mit Rolle) einer der Klassen, mit Anschrift
   * als Text fuer die Rechnungskopie. Dazu die Zahl aktiver Mitglieder ohne Beitragsklasse.
   */
  async feeRunCandidates(orgId: string, classIds: string[]): Promise<{ candidates: { userId: string; feeClassId: string; address: string }[]; withoutClass: number }> {
    await this.ensureProfiles(orgId);
    const [active, profiles] = await Promise.all([
      this.orgs.allActiveMembersWithRole(orgId),
      this.db.select().from(memberProfiles).where(and(eq(memberProfiles.orgId, orgId), isNull(memberProfiles.leftOn))),
    ]);
    const activeIds = new Set(active.map((a) => a.userId));
    const wanted = new Set(classIds);
    const current = profiles.filter((p) => activeIds.has(p.userId));
    const candidates = current
      .filter((p) => p.feeClassId && wanted.has(p.feeClassId))
      .map((p) => ({
        userId: p.userId,
        feeClassId: p.feeClassId!,
        address: [p.street, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join("\n"),
      }));
    return { candidates, withoutClass: current.filter((p) => !p.feeClassId).length };
  }

  // --- Export ---------------------------------------------------------------------------

  /** CSV (Semikolon, UTF-8 mit BOM). Nur Vorstand; wird protokolliert (Anzahl, keine Inhalte). */
  async exportCsv(user: PublicUser, slug: string): Promise<string> {
    const org = await this.requireRole(user, slug, ["admin"]);
    await this.ensureProfiles(org.id);
    const [active, profiles, classes] = await Promise.all([
      this.orgs.allActiveMembersWithRole(org.id),
      this.db.select().from(memberProfiles).where(and(eq(memberProfiles.orgId, org.id), isNull(memberProfiles.leftOn))).orderBy(asc(memberProfiles.memberNo)),
      this.db.select().from(feeClasses).where(eq(feeClasses.orgId, org.id)),
    ]);
    const names = await this.directory.names(active.map((a) => a.userId));
    const roleBy = new Map(active.map((a) => [a.userId, a.role]));
    const classBy = new Map(classes.map((c) => [c.id, c.name]));
    const cell = (v: string) => {
      const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; // Formel-Injection (Excel) entschaerfen
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = profiles.filter((p) => roleBy.has(p.userId));
    const lines = [["Mitgliedsnr", "Name", "Strasse", "PLZ", "Ort", "Telefon", "Geburtsdatum", "Eintritt", "Beitragsklasse", "Rolle"].join(";")];
    for (const p of rows) {
      lines.push(
        [String(p.memberNo), cell(names.get(p.userId) ?? DELETED), cell(p.street), cell(p.zip), cell(p.city), cell(p.phone), p.birthDate ?? "", p.joinedOn, cell(p.feeClassId ? classBy.get(p.feeClassId) ?? "" : ""), roleBy.get(p.userId)!].join(";"),
      );
    }
    await this.audit.record(user.id, "members.exported", { orgId: org.id, count: rows.length });
    return "﻿" + lines.join("\r\n") + "\r\n";
  }

  // --- Mitglieder-Import (Uebernahme beim Beitritt) ------------------------------------------

  /** Belegte Mitgliedsnummern eines Vereins (auch Ausgetretene, die Nummer bleibt Vereinsunterlage). */
  async usedMemberNos(orgId: string, nos: number[]): Promise<Set<number>> {
    if (nos.length === 0) return new Set();
    const rows = await this.db
      .select({ no: memberProfiles.memberNo })
      .from(memberProfiles)
      .where(and(eq(memberProfiles.orgId, orgId), inArray(memberProfiles.memberNo, nos)));
    return new Set(rows.map((r) => r.no));
  }

  /** Zaehler mindestens auf `no` setzen, damit automatisch vergebene Nummern nie mit importierten kollidieren. */
  async reserveMemberNos(orgId: string, maxNo: number, tx: Database = this.db): Promise<void> {
    await tx
      .insert(memberCounters)
      .values({ orgId, lastNo: maxNo })
      .onConflictDoUpdate({ target: memberCounters.orgId, set: { lastNo: sql`greatest(${memberCounters.lastNo}, excluded.last_no)` } });
  }

  /**
   * Beitritt ueber eine persoenliche Import-Einladung: Profil sicherstellen und Nummer, Eintritt und Beitragsklasse aus der
   * Liste des Vereins uebernehmen. Ist die Nummer inzwischen vergeben, bleibt die automatisch vergebene.
   */
  async applyImported(orgId: string, userId: string, data: { memberNo: number | null; joinedOn: string | null; feeClassId: string | null }): Promise<void> {
    await this.ensureProfiles(orgId);
    const where = and(eq(memberProfiles.orgId, orgId), eq(memberProfiles.userId, userId), isNull(memberProfiles.leftOn));
    const set: Partial<ProfileRow> = { updatedAt: new Date() };
    if (data.joinedOn) set.joinedOn = data.joinedOn;
    if (data.feeClassId && (await this.feeClassesOf(orgId, [data.feeClassId])).length) set.feeClassId = data.feeClassId;
    await this.db.update(memberProfiles).set(set).where(where);
    if (data.memberNo) {
      try {
        await this.db.update(memberProfiles).set({ memberNo: data.memberNo }).where(where);
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
  }

  // --- Datenschutz --------------------------------------------------------------------

  /** Austritt/Entfernung: personenbezogene Felder loeschen; Nummer, Daten und Beitragsklasse bleiben (pseudonym). */
  async anonymizeOnLeave(orgId: string, userId: string): Promise<void> {
    await this.db
      .update(memberProfiles)
      .set({ street: "", zip: "", city: "", phone: "", birthDate: null, guardianName: "", guardianEmail: "", notes: "", leftOn: today(), updatedAt: new Date() })
      .where(and(eq(memberProfiles.orgId, orgId), eq(memberProfiles.userId, userId), isNull(memberProfiles.leftOn)));
  }

  /** Verein geloescht (Kontoloeschung des einzigen Vorstands): alle Stammdaten, Vormerkungen, Beitragsklassen und Zaehler entfernen. */
  async eraseOrg(orgId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(memberProfiles).where(eq(memberProfiles.orgId, orgId));
      await tx.delete(pendingMembers).where(eq(pendingMembers.orgId, orgId));
      await tx.delete(feeClasses).where(eq(feeClasses.orgId, orgId));
      await tx.delete(memberCounters).where(eq(memberCounters.orgId, orgId));
    });
  }

  /** Kontoloeschung: alle Stammdaten der Person in allen Vereinen entfernen (Art. 17). */
  async eraseUser(userId: string): Promise<void> {
    await this.db.delete(memberProfiles).where(eq(memberProfiles.userId, userId));
    // Vorgemerkte Importe bleiben Vereinsunterlage, nur der Verweis auf die importierende Person entfaellt.
    await this.db.update(pendingMembers).set({ createdBy: null }).where(eq(pendingMembers.createdBy, userId));
  }

  /** Auskunft (Art. 15): eigene Stammdaten in allen Vereinen. */
  async exportFor(userId: string) {
    const rows = await this.db.select().from(memberProfiles).where(eq(memberProfiles.userId, userId));
    const orgs = await this.orgs.lookupByIds(rows.map((r) => r.orgId));
    return rows.map((r) => ({
      club: orgs.get(r.orgId)?.name ?? null,
      memberNo: r.memberNo,
      joinedOn: r.joinedOn,
      leftOn: r.leftOn,
      street: r.street,
      zip: r.zip,
      city: r.city,
      phone: r.phone,
      birthDate: r.birthDate,
      guardianName: r.guardianName,
      guardianEmail: r.guardianEmail,
      notes: r.notes, // Auskunftsrecht umfasst auch interne Notizen
    }));
  }

  // --- Kennzahlen fuer das Dashboard ----------------------------------------------------

  async stats(orgId: string) {
    await this.ensureProfiles(orgId);
    const profiles = await this.db.select().from(memberProfiles).where(and(eq(memberProfiles.orgId, orgId), isNull(memberProfiles.leftOn)));
    const classes = await this.db.select().from(feeClasses).where(eq(feeClasses.orgId, orgId));
    const classBy = new Map(classes.map((c) => [c.id, c.name]));
    const byClass = new Map<string, number>();
    for (const p of profiles) {
      const n = p.feeClassId ? classBy.get(p.feeClassId) ?? "Ohne Klasse" : "Ohne Klasse";
      byClass.set(n, (byClass.get(n) ?? 0) + 1);
    }
    const known = profiles.filter((p) => p.birthDate);
    const months: { month: string; joins: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const month = d.toISOString().slice(0, 7);
      months.push({ month, joins: profiles.filter((p) => p.joinedOn.startsWith(month)).length });
    }
    return {
      newMembers30d: profiles.filter((p) => p.joinedOn >= new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)).length,
      minors: known.length ? known.filter((p) => isMinor(p.birthDate)).length : null,
      byFeeClass: [...byClass].map(([name, members]) => ({ name, members })).sort((a, b) => b.members - a.members),
      joinsByMonth: months,
    };
  }
}
