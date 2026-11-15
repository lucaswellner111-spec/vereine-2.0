import { createHash, randomBytes, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  GUARDIAN_INVITE_VALID_DAYS,
  MAX_CHILDREN_PER_GUARDIAN,
  MAX_GUARDIANS_PER_CHILD,
  YOUTH_DELETION_NOTICE_DAYS,
  type DeleteChildResult,
  type GuardianInviteInfo,
  type YouthGuardiansView,
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
import { appLink } from "../common/app-url";
import { berlinDate } from "../common/berlin-date";
import { enforceLimit, limitMessage } from "../common/rate-limit";
import { ago, RETENTION } from "../common/retention";
import { DB, type Database } from "../db/db.module";
import { guardianConsents, guardianInvites, guardianships, users, youthProfiles } from "../db/schema";
import { EventsService } from "../events/events.service";
import { ShiftsService } from "../events/shifts.service";
import { JobsService } from "../jobs/jobs.service";
import { addressHash } from "../mail/mail-limits";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrgAdminService } from "../orgs/org-admin.service";
import { OrgEvents } from "../orgs/org-events";
import { OrgsService } from "../orgs/orgs.service";
import { objectingGuardian } from "./consent-rules";

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
    @Inject(MailService) private readonly mail: MailService,
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
    const deletion = profile.deletionRequestedAt
      ? {
          requestedAt: profile.deletionRequestedAt.toISOString(),
          deleteAfter: new Date(profile.deletionRequestedAt.getTime() + YOUTH_DELETION_NOTICE_DAYS * 86_400_000).toISOString(),
          byMe: profile.deletionRequestedBy === guardian.id,
        }
      : null;
    return { ...base, consents, events, attendance, deletion };
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
    // Freigaben restriktiv: hat der andere Elternteil der Mitgliedschaft in diesem Verein widersprochen, kann sie nicht erneut erteilt werden
    const targetSlug = input.slug ?? (await this.orgAdmin.info(child, input.token!)).orgSlug;
    if (await this.objectedByOther(childId, (await this.orgs.requireBySlug(targetSlug)).id, guardian.id)) {
      throw new ConflictException("Der andere Elternteil hat der Mitgliedschaft in diesem Verein widersprochen. Ihr müsst euch einigen: Er oder sie meldet dein Kind selbst wieder an.");
    }
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
    const others = (await this.youth.guardiansOf(childId)).filter((g) => g !== guardian.id);
    if (others.length) await this.notifications.notify(others, "guardian_notice", { kind: "org_left" }, { actorId: guardian.id });
  }

  /** Hat ein anderer aktiver Elternteil dieser Mitgliedschaft widersprochen (letzter eigener Eintrag = Widerruf)? */
  private async objectedByOther(childId: string, orgId: string, me: string): Promise<boolean> {
    const rows = await this.db
      .select({ guardianUserId: guardianConsents.guardianUserId, granted: guardianConsents.granted })
      .from(guardianConsents)
      .where(and(eq(guardianConsents.youthUserId, childId), eq(guardianConsents.purpose, "org_membership"), eq(guardianConsents.orgId, orgId)))
      .orderBy(desc(guardianConsents.createdAt), desc(guardianConsents.id))
      .limit(50);
    return objectingGuardian(rows, await this.youth.guardiansOf(childId), me) !== null;
  }

  // --- Zweiter Elternteil (Einladung) und Rechnungsempfaenger (Etappe E2) -----------------------------------------------------

  private async activeGuardianRows(childId: string) {
    return this.db
      .select({ g: guardianships, name: users.displayName })
      .from(guardianships)
      .innerJoin(users, and(eq(users.id, guardianships.guardianUserId), isNull(users.deletedAt)))
      .where(and(eq(guardianships.youthUserId, childId), eq(guardianships.status, "active")))
      .orderBy(guardianships.createdAt);
  }

  private openInvites(childId: string) {
    return this.db
      .select()
      .from(guardianInvites)
      .where(and(eq(guardianInvites.youthUserId, childId), eq(guardianInvites.status, "open"), gt(guardianInvites.expiresAt, sql`now()`)))
      .orderBy(guardianInvites.createdAt);
  }

  /** Beide Elternteile (mit Namen, die sehen sich ohnehin) und offene Einladungen (ohne Adresse). */
  async guardiansView(guardian: PublicUser, childId: string): Promise<YouthGuardiansView> {
    const { profile } = await this.requireChild(guardian.id, childId);
    const [rows, invites] = await Promise.all([this.activeGuardianRows(childId), this.openInvites(childId)]);
    return {
      guardians: rows.map((r) => ({ userId: r.g.guardianUserId, name: r.name, isMe: r.g.guardianUserId === guardian.id, isBillingContact: r.g.isBillingContact, since: r.g.createdAt.toISOString() })),
      invites: invites.map((i) => ({ id: i.id, createdAt: i.createdAt.toISOString(), expiresAt: i.expiresAt.toISOString() })),
      canInvite: !this.paused(profile) && rows.length + invites.length < MAX_GUARDIANS_PER_CHILD,
    };
  }

  /** Einladung per Mail: die Adresse wird nur gehasht gespeichert (Bindung der Annahme an dieses Konto), Link 7 Tage gueltig. */
  async inviteGuardian(guardian: PublicUser, childId: string, email: string): Promise<void> {
    await this.requireActiveChild(guardian.id, childId);
    if (email === guardian.email.trim().toLowerCase()) throw new BadRequestException("Das ist deine eigene Adresse. Lade den anderen Elternteil mit dessen Adresse ein.");
    await enforceLimit(this.cache, `guardian:invite:${guardian.id}`, 5, 86_400, limitMessage("Einladungen für Elternteile"));
    const [rows, invites] = await Promise.all([this.activeGuardianRows(childId), this.openInvites(childId)]);
    if (rows.length >= MAX_GUARDIANS_PER_CHILD) throw new BadRequestException("Dein Kind hat schon zwei Elternteile.");
    if (rows.length + invites.length >= MAX_GUARDIANS_PER_CHILD) throw new BadRequestException("Es gibt schon eine offene Einladung. Warte auf die Annahme oder ziehe sie zurück.");
    const token = randomBytes(32).toString("base64url");
    const [row] = await this.db
      .insert(guardianInvites)
      .values({ youthUserId: childId, inviterUserId: guardian.id, tokenHash: sha256(token), emailHash: addressHash(email), expiresAt: new Date(Date.now() + GUARDIAN_INVITE_VALID_DAYS * 86_400_000) })
      .returning({ id: guardianInvites.id });
    // Kostenbremse: Mail ueber den MailService (je Empfaenger/Konto begrenzt, globales Kontingent). Adresse nie in Logs oder Audit.
    const result = await this.mail.send(email, "guardian-invite", { inviterName: guardian.displayName, link: appLink(`/eltern-einladung/${token}`), validDays: GUARDIAN_INVITE_VALID_DAYS }, { actorId: guardian.id });
    const limited: Record<string, string> = {
      "limited:actor": "Du hast heute schon 20 Mails ausgelöst. Bitte versuche es morgen erneut.",
      "limited:recipient": "An diese Adresse wurden gerade schon mehrere Mails geschickt. Bitte versuche es später erneut.",
      "limited:org": "Bitte versuche es später erneut.",
    };
    if (limited[result]) {
      await this.db.delete(guardianInvites).where(eq(guardianInvites.id, row.id));
      throw new HttpException({ message: limited[result], statusCode: 429 }, 429);
    }
    await this.audit.record(guardian.id, "youth.guardian.invited", { youthId: childId, inviteId: row.id });
  }

  async revokeGuardianInvite(guardian: PublicUser, childId: string, inviteId: string): Promise<void> {
    await this.requireChild(guardian.id, childId);
    const res = await this.db
      .update(guardianInvites)
      .set({ status: "revoked" })
      .where(and(eq(guardianInvites.id, inviteId), eq(guardianInvites.youthUserId, childId), eq(guardianInvites.status, "open")))
      .returning({ id: guardianInvites.id });
    if (res.length === 0) throw new NotFoundException("Einladung nicht gefunden.");
    await this.audit.record(guardian.id, "youth.guardian.invite_revoked", { youthId: childId, inviteId });
  }

  /** Einladung pruefen: gueltig, offen und fuer das Konto mit der eingeladenen Adresse (sonst erfaehrt niemand etwas ueber das Kind). */
  private async usableInvite(user: PublicUser, token: string) {
    const gone = new NotFoundException("Dieser Einladungslink ist ungültig oder abgelaufen.");
    if (user.accountType === "youth") throw gone;
    const [row] = await this.db
      .select()
      .from(guardianInvites)
      .where(and(eq(guardianInvites.tokenHash, sha256(token)), eq(guardianInvites.status, "open"), gt(guardianInvites.expiresAt, sql`now()`)))
      .limit(1);
    if (!row) throw gone;
    if (row.emailHash !== addressHash(user.email)) {
      throw new ForbiddenException("Diese Einladung gilt für ein Konto mit einer anderen E-Mail-Adresse. Melde dich mit der Adresse an, an die sie geschickt wurde.");
    }
    if (await this.youth.isGuardianOf(user.id, row.youthUserId)) throw new ConflictException("Du bist schon Elternteil dieses Kindes.");
    return row;
  }

  async guardianInviteInfo(user: PublicUser, token: string): Promise<GuardianInviteInfo> {
    const row = await this.usableInvite(user, token);
    const ids = [row.youthUserId, ...(row.inviterUserId ? [row.inviterUserId] : [])];
    const found = await this.db.select({ id: users.id, name: users.displayName }).from(users).where(and(inArray(users.id, ids), isNull(users.deletedAt)));
    const name = (id: string | null) => found.find((u) => u.id === id)?.name;
    if (!name(row.youthUserId)) throw new NotFoundException("Dieser Einladungslink ist ungültig oder abgelaufen.");
    return { inviterName: name(row.inviterUserId) ?? "Ein Elternteil", childName: name(row.youthUserId)! };
  }

  /** Annahme: nur mit eigenem bestaetigten Konto (Controller), passender Adresse und Selbstauskunft; der andere Elternteil erfaehrt es. */
  async acceptGuardianInvite(user: PublicUser, token: string): Promise<{ childId: string }> {
    const row = await this.usableInvite(user, token);
    await enforceLimit(this.cache, `guardian:accept:${user.id}`, 10, 86_400, limitMessage("Annahmen von Einladungen"));
    await this.db.transaction(async (tx) => {
      const claimed = await tx
        .update(guardianInvites)
        .set({ status: "accepted", acceptedBy: user.id, acceptedAt: sql`now()` })
        .where(and(eq(guardianInvites.id, row.id), eq(guardianInvites.status, "open"), gt(guardianInvites.expiresAt, sql`now()`)))
        .returning({ id: guardianInvites.id });
      if (claimed.length === 0) throw new NotFoundException("Dieser Einladungslink ist ungültig oder abgelaufen.");
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(guardianships).where(and(eq(guardianships.youthUserId, row.youthUserId), eq(guardianships.status, "active")));
      if (n >= MAX_GUARDIANS_PER_CHILD) throw new ConflictException("Dein Kind hat schon zwei Elternteile.");
      await tx.insert(guardianships).values({ guardianUserId: user.id, youthUserId: row.youthUserId, isBillingContact: false });
      await tx.insert(guardianConsents).values(this.consentRow(row.youthUserId, user.id, "account", null, true));
    });
    const others = (await this.youth.guardiansOf(row.youthUserId)).filter((g) => g !== user.id);
    if (others.length) await this.notifications.notify(others, "guardian_notice", { kind: "invite_accepted" }, { actorId: user.id });
    await this.audit.record(user.id, "youth.guardian.joined", { youthId: row.youthUserId, inviteId: row.id });
    return { childId: row.youthUserId };
  }

  /**
   * Rechnungsempfaenger wechseln: genau ein Empfaenger je Kind bleibt erhalten (partieller Unique-Index; beide Updates in einer
   * Transaktion). Jeder aktive Elternteil darf; beide erfahren es. Bereits gestellte Rechnungen bleiben beim bisherigen Empfaenger.
   */
  async setBillingContact(guardian: PublicUser, childId: string, targetId: string): Promise<void> {
    await this.requireActiveChild(guardian.id, childId);
    await enforceLimit(this.cache, `guardian:billing:${guardian.id}`, 10, 86_400, limitMessage("Wechsel des Rechnungsempfängers"));
    const rows = await this.activeGuardianRows(childId);
    if (!rows.some((r) => r.g.guardianUserId === targetId)) throw new NotFoundException("Dieser Elternteil gehört nicht zu deinem Kind.");
    const current = rows.find((r) => r.g.isBillingContact)?.g.guardianUserId ?? null;
    if (current === targetId) return;
    try {
      await this.db.transaction(async (tx) => {
        await tx.update(guardianships).set({ isBillingContact: false }).where(and(eq(guardianships.youthUserId, childId), eq(guardianships.status, "active"), eq(guardianships.isBillingContact, true)));
        await tx.update(guardianships).set({ isBillingContact: true }).where(and(eq(guardianships.youthUserId, childId), eq(guardianships.guardianUserId, targetId), eq(guardianships.status, "active")));
      });
    } catch {
      throw new ConflictException("Der Rechnungsempfänger wurde gerade gleichzeitig geändert. Bitte lade die Seite neu und versuche es erneut.");
    }
    await this.audit.record(guardian.id, "youth.billing_contact.changed", { youthId: childId, from: current, to: targetId });
    const notify = [...new Set([current, targetId].filter((g): g is string => !!g && g !== guardian.id))];
    if (notify.length) await this.notifications.notify(notify, "guardian_notice", { kind: "billing_changed" }, { actorId: guardian.id });
  }

  // --- Loeschung mit Vorankuendigung (zwei Elternteile) ----------------------------------------------------------------------

  /**
   * Gibt es einen weiteren Elternteil, wird nicht sofort geloescht: der andere bekommt 7 Tage Vorankuendigung und kann
   * widersprechen (`cancelDeletion`). Mit nur einem Elternteil: sofort (Aufrufer loescht).
   */
  async planDeletion(guardianId: string, childId: string): Promise<DeleteChildResult> {
    const { profile } = await this.requireChild(guardianId, childId);
    const others = (await this.youth.guardiansOf(childId)).filter((g) => g !== guardianId);
    if (others.length === 0) return { status: "deleted" };
    const after = (d: Date) => new Date(d.getTime() + YOUTH_DELETION_NOTICE_DAYS * 86_400_000).toISOString();
    if (profile.deletionRequestedAt) return { status: "scheduled", deleteAfter: after(profile.deletionRequestedAt) }; // laeuft schon, Frist wird nicht verlaengert
    const [row] = await this.db
      .update(youthProfiles)
      .set({ deletionRequestedAt: sql`now()`, deletionRequestedBy: guardianId })
      .where(and(eq(youthProfiles.userId, childId), isNull(youthProfiles.deletionRequestedAt)))
      .returning({ at: youthProfiles.deletionRequestedAt });
    if (!row?.at) return { status: "scheduled", deleteAfter: after(new Date()) }; // paralleler Antrag war schneller
    const deleteAfter = after(row.at);
    await this.notifications.notify(others, "guardian_notice", { kind: "deletion_requested", deleteAfter }, { actorId: guardianId });
    await this.audit.record(guardianId, "youth.deletion.requested", { youthId: childId });
    return { status: "scheduled", deleteAfter };
  }

  /** Widerspruch (oder Rueckzug) gegen die geplante Loeschung: jeder aktive Elternteil. */
  async cancelDeletion(guardian: PublicUser, childId: string): Promise<void> {
    const { profile } = await this.requireChild(guardian.id, childId);
    if (!profile.deletionRequestedAt) throw new NotFoundException("Es ist keine Löschung geplant.");
    await this.db.update(youthProfiles).set({ deletionRequestedAt: null, deletionRequestedBy: null }).where(eq(youthProfiles.userId, childId));
    const others = (await this.youth.guardiansOf(childId)).filter((g) => g !== guardian.id);
    if (others.length) await this.notifications.notify(others, "guardian_notice", { kind: "deletion_canceled" }, { actorId: guardian.id });
    await this.audit.record(guardian.id, "youth.deletion.canceled", { youthId: childId });
  }

  /** Jugendkonten, deren Vorankuendigung (7 Tage) abgelaufen ist und die nicht widersprochen wurden (Job privacy.retention loescht sie). */
  async deletionDue(limit = 100): Promise<string[]> {
    const rows = await this.db
      .select({ id: youthProfiles.userId })
      .from(youthProfiles)
      .where(and(isNotNull(youthProfiles.deletionRequestedAt), lt(youthProfiles.deletionRequestedAt, ago(RETENTION.youthDeletionNotice))))
      .limit(limit);
    return rows.map((r) => r.id);
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
    const invited = await this.db.select().from(guardianInvites).where(eq(guardianInvites.inviterUserId, userId)).orderBy(guardianInvites.createdAt);
    return {
      // Eingeladene Adresse wird nicht gespeichert (nur ein Hash zur Bindung der Annahme)
      guardianInvitesSent: invited.map((i) => ({ childId: i.youthUserId, status: i.status, at: i.createdAt.toISOString(), expiresAt: i.expiresAt.toISOString() })),
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
      // Einladungen an/von diesem Konto sind ohne das Konto sinnlos (Hash der Adresse, Token)
      await tx.delete(guardianInvites).where(or(eq(guardianInvites.inviterUserId, userId), eq(guardianInvites.acceptedBy, userId)));
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
    // Einladungen an einen zweiten Elternteil: 30 Tage nach Ablauf bzw. Annahme/Widerruf
    const old = ago(RETENTION.guardianInvites);
    const gone = await this.db
      .delete(guardianInvites)
      .where(or(and(eq(guardianInvites.status, "open"), lt(guardianInvites.expiresAt, old)), and(sql`${guardianInvites.status} <> 'open'`, lt(guardianInvites.createdAt, old))))
      .returning({ id: guardianInvites.id });
    return gone.length + (await this.purgeConsents());
  }

  private async purgeConsents(): Promise<number> {
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

  async auditDeleted(guardianId: string | null, childId: string): Promise<void> {
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
