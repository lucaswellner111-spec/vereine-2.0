import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { and, desc, eq, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import {
  MAX_CHILDREN_PER_GUARDIAN,
  YOUTH_AGE_LIMIT,
  YOUTH_AGE_MIN,
  YOUTH_CONSENT_TEXTS,
  YOUTH_CONSENT_VERSION,
  graduationDate,
  type CreateYouthInput,
  type JoinOrgForChildInput,
  type PublicUser,
  type RsvpStatus,
  type YouthChild,
  type YouthChildDetail,
  type YouthConsentEntry,
  type YouthConsentPurpose,
  type YouthEvent,
  type YouthShiftItem,
} from "@vereine/shared";
import { AuditService } from "../auth/audit.service";
import { AuthService } from "../auth/auth.service";
import { YouthDirectory } from "../auth/youth-directory.service";
import { CACHE, type Cache } from "../cache/cache.module";
import { ageOn, daysUntil16, isYouthAge, reached16 } from "../common/age";
import { berlinDate } from "../common/berlin-date";
import { enforceLimit, limitMessage } from "../common/rate-limit";
import { ago, RETENTION } from "../common/retention";
import { DB, type Database } from "../db/db.module";
import { guardianConsents, guardianships, users, youthProfiles } from "../db/schema";
import { EventsService } from "../events/events.service";
import { ShiftsService } from "../events/shifts.service";
import { JobsService } from "../jobs/jobs.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrgAdminService } from "../orgs/org-admin.service";
import { OrgEvents } from "../orgs/org-events";
import { OrgsService } from "../orgs/orgs.service";

/** Kein gueltiger argon2-Hash: `verify` schlaegt nie an, ausserdem blockiert der Login Jugendkonten ausdruecklich. */
export const NO_LOGIN_HASH = "!kein-login";
export const youthPlaceholderEmail = (id: string) => `youth+${id}@konto.invalid`;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const initial = (name: string) => [...name.trim()][0]?.toLocaleUpperCase("de") ?? "";
const EVENT_LIMIT = 20;
const ATTENDANCE_LIMIT = 15;

type ProfileRow = typeof youthProfiles.$inferSelect;
type UserRow = typeof users.$inferSelect;

/**
 * Elternkonto -> Jugendkonten (docs/welle2/JUGEND-KONZEPT.md, Etappe E1; Bereich identity).
 * Eltern verwalten alles; das Kind hat KEINEN eigenen Zugang (Platzhalter-E-Mail *.invalid, kein Passwort, keine Sitzung).
 * Alles an Fremdbereichen laeuft ueber deren Dienste (Mitgliedschaft, Zusagen, Helferlisten).
 */
@Injectable()
export class GuardianService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CACHE) private readonly cache: Cache,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(YouthDirectory) private readonly youth: YouthDirectory,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(OrgAdminService) private readonly orgAdmin: OrgAdminService,
    @Inject(OrgEvents) private readonly orgEvents: OrgEvents,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(ShiftsService) private readonly shifts: ShiftsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.define("youth.graduation", async () => void (await this.runGraduation()));
    this.jobs.every("youth.graduation", 24 * 60 * 60 * 1000);
    // Austritt (auch durch den Vorstand): Freigabe fuer diesen Verein als widerrufen nachweisen
    this.orgEvents.onLeave("guardian.consent", (orgId, userId) => this.recordLeave(orgId, userId));
  }

  // --- Zugriff -------------------------------------------------------------------------------------

  /** Aktiver Elternteil des Kindes, sonst 404 (verraet nicht, ob es das Kind gibt). */
  private async requireChild(guardianId: string, childId: string): Promise<{ profile: ProfileRow; user: UserRow }> {
    const [row] = await this.db
      .select({ profile: youthProfiles, user: users })
      .from(guardianships)
      .innerJoin(youthProfiles, eq(youthProfiles.userId, guardianships.youthUserId))
      .innerJoin(users, and(eq(users.id, guardianships.youthUserId), isNull(users.deletedAt), eq(users.accountType, "youth")))
      .where(and(eq(guardianships.guardianUserId, guardianId), eq(guardianships.youthUserId, childId), eq(guardianships.status, "active")))
      .limit(1);
    if (!row) throw new NotFoundException("Kind nicht gefunden.");
    return row;
  }

  /** Wie requireChild, aber nur solange das Jugendkonto nicht ruht (ab dem 16. Geburtstag keine Aenderungen mehr). */
  private async requireActiveChild(guardianId: string, childId: string) {
    const found = await this.requireChild(guardianId, childId);
    if (this.paused(found.profile)) {
      throw new ConflictException("Dein Kind ist 16 geworden. Das Jugendkonto ruht, Änderungen sind nicht mehr möglich. Dein Kind braucht ein eigenes Konto.");
    }
    return found;
  }

  private paused(p: ProfileRow): boolean {
    return !!p.graduationStartedAt || reached16(p.birthDate);
  }

  async assertGuardianOf(guardianId: string, childId: string): Promise<void> {
    await this.requireChild(guardianId, childId);
  }

  /** Das Jugendkonto als Nutzerobjekt, mit dem die Fachdienste im Namen des Kindes handeln (nur nach requireChild!). */
  childUser(row: UserRow): PublicUser {
    return this.auth.toPublic(row);
  }

  // --- Anlegen und Lesen ----------------------------------------------------------------------------

  async create(guardian: PublicUser, input: CreateYouthInput): Promise<YouthChild> {
    if (guardian.accountType === "youth") throw new NotFoundException();
    const today = berlinDate();
    if (!isYouthAge(input.birthDate, today)) {
      throw new BadRequestException(
        input.birthDate <= today && ageOn(input.birthDate, today) >= YOUTH_AGE_LIMIT
          ? `Ab ${YOUTH_AGE_LIMIT} Jahren legt dein Kind ein eigenes Konto an.`
          : input.birthDate <= today && ageOn(input.birthDate, today) < YOUTH_AGE_MIN
            ? `Jugendkonten gibt es ab ${YOUTH_AGE_MIN} Jahren.`
            : "Das Geburtsdatum ist nicht plausibel.",
      );
    }
    await enforceLimit(this.cache, `guardian:create:${guardian.id}`, 5, 86_400, limitMessage("neue Kinder pro Tag"));
    const [{ n }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(guardianships)
      .where(and(eq(guardianships.guardianUserId, guardian.id), eq(guardianships.status, "active")));
    if (n >= MAX_CHILDREN_PER_GUARDIAN) throw new BadRequestException(`Du kannst höchstens ${MAX_CHILDREN_PER_GUARDIAN} Kinder anlegen.`);

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const id = randomUUID();
    await this.db.transaction(async (tx) => {
      await tx.insert(users).values({
        id,
        email: youthPlaceholderEmail(id),
        passwordHash: NO_LOGIN_HASH,
        displayName: `${firstName} ${initial(lastName)}.`,
        accountType: "youth",
      });
      await tx.insert(youthProfiles).values({
        userId: id,
        fullName: `${firstName} ${lastName}`,
        birthDate: input.birthDate,
        graduationDueOn: graduationDate(input.birthDate),
        createdBy: guardian.id,
      });
      await tx.insert(guardianships).values({ guardianUserId: guardian.id, youthUserId: id, isBillingContact: true });
      await tx.insert(guardianConsents).values(this.consentRow(id, guardian.id, "account", null, true));
    });
    await this.audit.record(guardian.id, "youth.created", { youthId: id }); // ohne Namen und Geburtsdatum
    return (await this.listChildren(guardian.id)).find((c) => c.id === id)!;
  }

  async listChildren(guardianId: string): Promise<YouthChild[]> {
    const rows = await this.db
      .select({ profile: youthProfiles, user: users, billing: guardianships.isBillingContact })
      .from(guardianships)
      .innerJoin(youthProfiles, eq(youthProfiles.userId, guardianships.youthUserId))
      .innerJoin(users, and(eq(users.id, guardianships.youthUserId), isNull(users.deletedAt)))
      .where(and(eq(guardianships.guardianUserId, guardianId), eq(guardianships.status, "active")))
      .orderBy(youthProfiles.birthDate)
      .limit(MAX_CHILDREN_PER_GUARDIAN);
    const memberships = await Promise.all(rows.map((r) => this.orgs.membershipsOf(r.user.id)));
    return rows.map((r, i) => this.view(r.profile, r.user, r.billing, memberships[i]));
  }

  private view(p: ProfileRow, u: UserRow, billing: boolean, orgs: YouthChild["orgs"]): YouthChild {
    return {
      id: u.id,
      name: u.displayName,
      fullName: p.fullName,
      birthDate: p.birthDate,
      age: ageOn(p.birthDate),
      graduationDue: p.graduationDueOn,
      paused: this.paused(p),
      isBillingContact: billing,
      orgs,
    };
  }

  async detail(guardian: PublicUser, childId: string): Promise<YouthChildDetail> {
    const { profile, user } = await this.requireChild(guardian.id, childId);
    const child = this.childUser(user);
    const base = (await this.listChildren(guardian.id)).find((c) => c.id === childId);
    if (!base) throw new NotFoundException("Kind nicht gefunden.");
    const [consents, items, history] = await Promise.all([
      this.consentState(childId),
      this.events.listMine(child, {}).catch(() => []),
      this.events.exportFor(childId),
    ]);
    const upcoming = items.slice(0, EVENT_LIMIT);
    const shiftLists = await Promise.all(upcoming.map((e) => this.shifts.list(child, e.id).catch(() => [])));
    const events: YouthEvent[] = upcoming.map((e, i) => ({
      id: e.id,
      orgSlug: e.orgSlug,
      orgName: e.orgName,
      title: e.title,
      location: e.location,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      canceled: e.canceled,
      myStatus: e.myStatus,
      shifts: shiftLists[i].map<YouthShiftItem>((s) => ({ id: s.id, title: s.title, startsAt: s.startsAt, endsAt: s.endsAt, slots: s.slots, taken: s.taken, mine: s.mine })),
    }));
    const attendance = history.attendance
      .sort((a, b) => b.eventStartsAt.localeCompare(a.eventStartsAt))
      .slice(0, ATTENDANCE_LIMIT)
      .map((a) => ({ eventTitle: a.eventTitle, startsAt: a.eventStartsAt, status: a.status as "present" | "absent" | "excused" }));
    void profile;
    return { ...base, consents, events, attendance };
  }

  // --- Freigaben (Nachweis, append-only) --------------------------------------------------------------

  private consentRow(youthId: string, guardianId: string | null, purpose: YouthConsentPurpose, orgId: string | null, granted: boolean, version = YOUTH_CONSENT_VERSION, text?: string) {
    return {
      youthUserId: youthId,
      guardianUserId: guardianId,
      purpose,
      orgId,
      granted,
      textVersion: version,
      textHash: sha256(text ?? YOUTH_CONSENT_TEXTS[purpose]),
    };
  }

  /** Aktueller Stand je Zweck und Verein = letzter Eintrag. */
  private async consentState(youthId: string): Promise<YouthConsentEntry[]> {
    const rows = await this.db.select().from(guardianConsents).where(eq(guardianConsents.youthUserId, youthId)).orderBy(desc(guardianConsents.createdAt), desc(guardianConsents.id)).limit(500);
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const key = `${r.purpose}|${r.orgId ?? ""}`;
      if (!latest.has(key)) latest.set(key, r);
    }
    const orgs = await this.orgs.lookupByIds([...latest.values()].flatMap((r) => (r.orgId ? [r.orgId] : [])));
    return [...latest.values()]
      .map((r) => ({
        purpose: r.purpose as YouthConsentPurpose,
        orgId: r.orgId,
        orgName: r.orgId ? (orgs.get(r.orgId)?.name ?? null) : null,
        granted: r.granted,
        version: r.textVersion,
        at: r.createdAt.toISOString(),
      }))
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  private async currentlyGranted(youthId: string, orgId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ granted: guardianConsents.granted })
      .from(guardianConsents)
      .where(and(eq(guardianConsents.youthUserId, youthId), eq(guardianConsents.purpose, "org_membership"), eq(guardianConsents.orgId, orgId)))
      .orderBy(desc(guardianConsents.createdAt), desc(guardianConsents.id))
      .limit(1);
    return row?.granted ?? false;
  }

  private async recordConsent(youthId: string, guardianId: string | null, purpose: YouthConsentPurpose, orgId: string | null, granted: boolean) {
    await this.db.insert(guardianConsents).values(this.consentRow(youthId, guardianId, purpose, orgId, granted));
    await this.audit.record(guardianId, granted ? "youth.consent.granted" : "youth.consent.revoked", { youthId, purpose, ...(orgId ? { orgId } : {}) });
  }

  /** Austritt: Freigabe als widerrufen nachweisen, falls sie noch galt (idempotent; die Eltern tragen den Nachweis bei eigenem Austritt selbst ein). */
  private async recordLeave(orgId: string, userId: string): Promise<void> {
    if (!(await this.youth.isYouth(userId))) return;
    if (await this.currentlyGranted(userId, orgId)) await this.recordConsent(userId, null, "org_membership", orgId, false);
  }

  // --- Mitgliedschaft des Kindes (ueber die Eltern) ------------------------------------------------------

  /** Verein beitreten: per Einladungslink (Vereinsbestaetigung = Einladung) oder per Antrag (der Vorstand bestaetigt). */
  async join(guardian: PublicUser, childId: string, input: JoinOrgForChildInput): Promise<{ orgName: string; orgSlug: string; status: "active" | "pending" }> {
    const { user } = await this.requireActiveChild(guardian.id, childId);
    await enforceLimit(this.cache, `guardian:join:${guardian.id}`, 20, 86_400, limitMessage("Vereinsbeitritte für Kinder"));
    const child = this.childUser(user);
    let orgName: string;
    let orgSlug: string;
    let status: "active" | "pending";
    if (input.token) {
      const res = await this.orgAdmin.accept(child, input.token, { viaGuardian: true });
      orgName = res.orgName;
      orgSlug = res.orgSlug;
      status = "active";
    } else {
      const detail = await this.orgs.requestMembership(input.slug!, childId, { viaGuardian: true });
      orgName = detail.name;
      orgSlug = detail.slug;
      status = "pending";
    }
    const org = await this.orgs.requireBySlug(orgSlug);
    if (!(await this.currentlyGranted(childId, org.id))) await this.recordConsent(childId, guardian.id, "org_membership", org.id, true);
    return { orgName, orgSlug, status };
  }

  /** Das Kind aus dem Verein austreten lassen (Elternteil) bzw. einen offenen Antrag zurueckziehen. */
  async leave(guardian: PublicUser, childId: string, slug: string): Promise<void> {
    const { user } = await this.requireChild(guardian.id, childId); // Austritt ist auch nach dem 16. Geburtstag moeglich
    const org = await this.orgs.requireBySlug(slug);
    if (await this.currentlyGranted(childId, org.id)) await this.recordConsent(childId, guardian.id, "org_membership", org.id, false);
    await this.orgs.removeMember(slug, this.childUser(user), childId);
  }

  // --- Zu-/Absagen und Helferlisten (im Namen des Kindes) ----------------------------------------------------

  async rsvp(guardian: PublicUser, childId: string, eventId: string, status: RsvpStatus): Promise<YouthEvent["myStatus"]> {
    const { user } = await this.requireActiveChild(guardian.id, childId);
    await enforceLimit(this.cache, `guardian:rsvp:${guardian.id}`, 120, 3600, limitMessage("Zu-/Absagen"));
    const item = await this.events.rsvp(this.childUser(user), eventId, status);
    // Der andere Elternteil erfaehrt davon (Name des Kindes steht nicht in der Benachrichtigung)
    const others = (await this.youth.guardiansOf(childId)).filter((g) => g !== guardian.id);
    if (others.length) {
      await this.notifications.notify(
        others,
        "child_rsvp",
        { eventId, title: item.title, orgSlug: item.orgSlug, orgName: item.orgName, startsAt: item.startsAt, status: item.myStatus ?? status },
        { actorId: guardian.id },
      );
    }
    return item.myStatus;
  }

  async shiftSignup(guardian: PublicUser, childId: string, shiftId: string): Promise<void> {
    const { user } = await this.requireActiveChild(guardian.id, childId);
    await enforceLimit(this.cache, `guardian:shift:${guardian.id}`, 60, 3600, limitMessage("Helfer-Eintragungen"));
    await this.shifts.signup(this.childUser(user), shiftId);
  }

  async shiftLeave(guardian: PublicUser, childId: string, shiftId: string): Promise<void> {
    const { user } = await this.requireActiveChild(guardian.id, childId);
    await this.shifts.leave(this.childUser(user), shiftId);
  }

  // --- Datenschutz (Auskunft, Loeschung, Fristen) ---------------------------------------------------------------

  /** Das Kind fuer Auskunft/Loeschung durch den Elternteil: Pruefung der Elternschaft, liefert das Nutzerobjekt des Kindes. */
  async childForPrivacy(guardianId: string, childId: string): Promise<PublicUser> {
    const { user } = await this.requireChild(guardianId, childId);
    return this.childUser(user);
  }

  /** Auskunft zum Jugendkonto selbst (ohne Platzhalter-E-Mail): Stammdaten, Freigaben, Eltern (nur Anzahl). */
  async exportChild(guardianId: string, childId: string) {
    const { profile, user } = await this.requireChild(guardianId, childId);
    const [consents, [{ n }]] = await Promise.all([
      this.db.select().from(guardianConsents).where(eq(guardianConsents.youthUserId, childId)).orderBy(guardianConsents.createdAt),
      this.db.select({ n: sql<number>`count(*)::int` }).from(guardianships).where(and(eq(guardianships.youthUserId, childId), eq(guardianships.status, "active"))),
    ]);
    const orgs = await this.orgs.lookupByIds(consents.flatMap((c) => (c.orgId ? [c.orgId] : [])));
    return {
      account: { id: user.id, displayName: user.displayName, fullName: profile.fullName, birthDate: profile.birthDate, createdAt: user.createdAt.toISOString(), accountType: "youth", login: "kein eigener Zugang (Verwaltung durch die Eltern)" },
      graduationDueOn: profile.graduationDueOn,
      guardianCount: n,
      consents: consents.map((c) => ({ purpose: c.purpose, club: c.orgId ? (orgs.get(c.orgId)?.name ?? null) : null, granted: c.granted, textVersion: c.textVersion, at: c.createdAt.toISOString() })),
    };
  }

  /** Auskunft zur eigenen Person als Elternteil: Verknuepfungen und die erteilten Freigaben (keine Daten anderer Eltern). */
  async exportFor(userId: string) {
    const [links, given] = await Promise.all([
      this.db
        .select({ g: guardianships, name: users.displayName })
        .from(guardianships)
        .leftJoin(users, eq(users.id, guardianships.youthUserId))
        .where(eq(guardianships.guardianUserId, userId)),
      this.db.select().from(guardianConsents).where(eq(guardianConsents.guardianUserId, userId)).orderBy(guardianConsents.createdAt),
    ]);
    const orgs = await this.orgs.lookupByIds(given.flatMap((c) => (c.orgId ? [c.orgId] : [])));
    return {
      children: links.map((l) => ({ childId: l.g.youthUserId, childName: l.name ?? null, status: l.g.status, billingContact: l.g.isBillingContact, since: l.g.createdAt.toISOString() })),
      consentsGiven: given.map((c) => ({ childId: c.youthUserId, purpose: c.purpose, club: c.orgId ? (orgs.get(c.orgId)?.name ?? null) : null, granted: c.granted, textVersion: c.textVersion, at: c.createdAt.toISOString() })),
    };
  }

  /**
   * Kontoloeschung. Als Elternteil: Freigaben entkoppeln (Nachweis bleibt), Rechnungsempfaenger an einen anderen Elternteil
   * uebergeben; war er der letzte, ruht das Kind und wird nach 30 Tagen geloescht. Als Kind: Nachweise pseudonym 3 Jahre aufbewahren.
   */
  async eraseUser(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const links = await tx.select().from(guardianships).where(and(eq(guardianships.guardianUserId, userId), eq(guardianships.status, "active")));
      for (const link of links) {
        const others = await tx
          .select({ id: guardianships.id })
          .from(guardianships)
          .where(and(eq(guardianships.youthUserId, link.youthUserId), eq(guardianships.status, "active"), sql`${guardianships.guardianUserId} <> ${userId}`))
          .orderBy(guardianships.createdAt)
          .limit(1);
        if (others.length === 0) {
          await tx.update(youthProfiles).set({ orphanedAt: sql`now()` }).where(and(eq(youthProfiles.userId, link.youthUserId), isNull(youthProfiles.orphanedAt)));
        } else if (link.isBillingContact) {
          await tx.update(guardianships).set({ isBillingContact: false }).where(eq(guardianships.id, link.id));
          await tx.update(guardianships).set({ isBillingContact: true }).where(eq(guardianships.id, others[0].id));
        }
      }
      // Nachweis bleibt, die Person wird entkoppelt (erlaubte Aenderung des Triggers)
      await tx.update(guardianConsents).set({ guardianUserId: null }).where(eq(guardianConsents.guardianUserId, userId));
      // Jugendkonto: Aufbewahrungsfrist der Nachweise beginnt (pseudonym: nur IDs)
      await tx
        .update(guardianConsents)
        .set({ retainUntil: sql`now() + interval '3 years'` })
        .where(and(eq(guardianConsents.youthUserId, userId), isNull(guardianConsents.retainUntil)));
    });
  }

  /** Loeschfrist (Job privacy.retention): Nachweise geloeschter Jugendkonten nach 3 Jahren. Der Trigger erlaubt Loeschen nur hier. */
  async purgeExpired(): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('vereine.consent_purge', 'on', true)`);
      const rows = await tx.delete(guardianConsents).where(and(isNotNull(guardianConsents.retainUntil), lt(guardianConsents.retainUntil, sql`now()`))).returning({ id: guardianConsents.id });
      return rows.length;
    });
  }

  /** Jugendkonten ohne Elternteil seit mehr als 30 Tagen (der Datenschutzdienst loescht sie). */
  async orphanedForDeletion(limit = 100): Promise<string[]> {
    const rows = await this.db
      .select({ id: youthProfiles.userId })
      .from(youthProfiles)
      .where(and(isNotNull(youthProfiles.orphanedAt), lt(youthProfiles.orphanedAt, ago(RETENTION.orphanedYouth))))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  async auditDeleted(guardianId: string, childId: string): Promise<void> {
    await this.audit.record(guardianId, "youth.deleted", { youthId: childId });
  }

  async auditExported(guardianId: string, childId: string): Promise<void> {
    await this.audit.record(guardianId, "youth.exported", { youthId: childId });
  }

  // --- 16. Geburtstag (Job youth.graduation) ----------------------------------------------------------------------

  /**
   * Taeglich: 30 und 7 Tage vor dem 16. Geburtstag Hinweis an die Eltern; am Geburtstag ruht das Jugendkonto
   * (Etappe E1: nur Hinweis und Sperre aller Aenderungen, die Uebernahme durch das Kind folgt in E5). Idempotent.
   */
  async runGraduation(today = berlinDate()): Promise<{ notified: number; paused: number }> {
    const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
    const rows = await this.db
      .select()
      .from(youthProfiles)
      .innerJoin(users, and(eq(users.id, youthProfiles.userId), isNull(users.deletedAt)))
      .where(and(isNull(youthProfiles.graduationStartedAt), lte(youthProfiles.graduationDueOn, horizon)))
      .limit(500);
    let notified = 0;
    let paused = 0;
    for (const { youth_profiles: p } of rows) {
      const days = daysUntil16(p.birthDate, today);
      const guardians = await this.youth.guardiansOf(p.userId);
      if (days <= 0) {
        await this.db.update(youthProfiles).set({ graduationStartedAt: sql`now()` }).where(and(eq(youthProfiles.userId, p.userId), isNull(youthProfiles.graduationStartedAt)));
        paused += 1;
        await this.notifications.notify(guardians, "child_graduation", { days: "0" });
        await this.audit.record(null, "youth.graduation.paused", { youthId: p.userId });
      } else if (days <= 7 && !p.notified7At) {
        await this.db.update(youthProfiles).set({ notified7At: sql`now()`, notified30At: sql`coalesce(${youthProfiles.notified30At}, now())` }).where(eq(youthProfiles.userId, p.userId));
        await this.notifications.notify(guardians, "child_graduation", { days: String(days) });
        notified += 1;
      } else if (days <= 30 && days > 7 && !p.notified30At) {
        await this.db.update(youthProfiles).set({ notified30At: sql`now()` }).where(eq(youthProfiles.userId, p.userId));
        await this.notifications.notify(guardians, "child_graduation", { days: String(days) });
        notified += 1;
      }
    }
    return { notified, paused };
  }

  /** Nur fuer Tests und das Dashboard: Zahl der Kinder je Elternteil. */
  async childIds(guardianId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: guardianships.youthUserId })
      .from(guardianships)
      .where(and(eq(guardianships.guardianUserId, guardianId), eq(guardianships.status, "active")));
    return rows.map((r) => r.id);
  }
}
