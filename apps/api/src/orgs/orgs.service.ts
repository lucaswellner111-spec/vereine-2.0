import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, gt, ilike, inArray, ne, or, sql } from "drizzle-orm";
import {
  isTagId,
  RESERVED_ORG_SLUGS,
  type CreateOrgInput,
  type MemberItem,
  type OrgDetail,
  type OrgMemberName,
  type OrgRole,
  type OrgSummary,
  type PublicOrgQuery,
  type PublicOrgSummary,
  type PublicUser,
  type UpdateOrgInput,
} from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { UsersDirectory } from "../auth/users-directory.service";
import { CACHE, type Cache } from "../cache/cache.module";
import { isUniqueViolation } from "../common/pg-errors";
import { invalidatePublicOrg } from "../common/public-cache";
import { enforceLimit, limitMessage } from "../common/rate-limit";
import { follows, orgMembers, organizations } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { ProfileAccess } from "../profiles/profile-access.service";
import { OrgEvents } from "./org-events";

type OrgRow = typeof organizations.$inferSelect;
/** Datenbank oder laufende Transaktion (in Transaktionen nur `tx` benutzen, sonst verklemmt PGlite). */
type DbOrTx = Database;

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "verein";

/** Platzhalter % und _ in Suchbegriffen woertlich nehmen. */
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class OrgsService {
  private readonly log = new Logger("OrgsService");

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
    @Inject(OrgEvents) private readonly events: OrgEvents,
    @Inject(CACHE) private readonly cache: Cache,
    @Inject(ProfileAccess) private readonly access: ProfileAccess,
  ) {}

  /**
   * Neuer Verein mit freier Adresse (slug). Parallele Anlagen mit gleichem Namen: der Unique-Index entscheidet,
   * der Verlierer nimmt den naechsten Suffix (je Versuch eigene Transaktion), nach 20 Versuchen ein Zufallssuffix.
   */
  async create(user: PublicUser, input: CreateOrgInput): Promise<OrgDetail> {
    await enforceLimit(this.cache, `org:create:${user.id}`, 10, 24 * 3600, limitMessage("neue Vereine"));
    const base = slugify(input.name);
    const sequential = [base, ...Array.from({ length: 19 }, (_, i) => `${base}-${i + 2}`)];
    for (let attempt = 0; attempt < sequential.length + 3; attempt++) {
      const random = attempt >= sequential.length;
      const slug = random ? `${base.slice(0, 52)}-${randomBytes(3).toString("hex")}` : sequential[attempt];
      if (RESERVED_ORG_SLUGS.includes(slug) || (!random && (await this.findBySlug(slug)))) continue;
      try {
        const org = await this.db.transaction(async (tx) => {
          const [created] = await tx.insert(organizations).values({ ...input, slug }).returning();
          await tx.insert(orgMembers).values({ orgId: created.id, userId: user.id, role: "admin", status: "active" });
          await tx.insert(follows).values({ orgId: created.id, userId: user.id });
          return created;
        });
        return this.detail(org.slug, user.id);
      } catch (err) {
        if (!isUniqueViolation(err)) throw err; // Adresse inzwischen vergeben -> naechster Versuch
      }
    }
    throw new ConflictException("Für diesen Namen ist keine freie Vereinsadresse mehr verfügbar. Bitte wähle einen anderen Namen.");
  }

  async list(userId: string, q?: string, tag?: string, city?: string): Promise<OrgSummary[]> {
    const term = q?.trim();
    const place = city?.trim().slice(0, 60);
    const rows = await this.db
      .select()
      .from(organizations)
      .where(
        and(
          term
            ? or(ilike(organizations.name, `%${term}%`), ilike(organizations.city, `%${term}%`), ilike(organizations.category, `%${term}%`))
            : undefined,
          tag && isTagId(tag) ? sql`${organizations.tags} @> ARRAY[${tag}]::text[]` : undefined,
          place ? ilike(organizations.city, `%${escapeLike(place)}%`) : undefined,
        ),
      )
      .orderBy(organizations.name)
      .limit(100);
    void userId;
    return this.summaries(rows);
  }

  /** Vereine, fuer die der Nutzer Beitraege veroeffentlichen darf (Vorstand/Moderation). */
  async publishable(userId: string): Promise<OrgSummary[]> {
    const rows = await this.db
      .select({ org: organizations })
      .from(orgMembers)
      .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
      .where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, "active"), inArray(orgMembers.role, ["admin", "moderator"])))
      .orderBy(organizations.name);
    return this.summaries(rows.map((r) => r.org));
  }

  /** Tags (Sportarten/Themen) des Vereins setzen; nur Vorstand. Werte sind per Zod auf den Katalog begrenzt. */
  async setTags(slug: string, actor: PublicUser, tags: string[]): Promise<OrgDetail> {
    const org = await this.requireBySlug(slug);
    if ((await this.activeRole(org.id, actor.id)) !== "admin") throw new ForbiddenException("Nur der Vorstand ändert die Tags des Vereins.");
    await this.db.update(organizations).set({ tags }).where(eq(organizations.id, org.id));
    if (org.publicPage) await invalidatePublicOrg(this.cache, slug, true);
    return this.detail(slug, actor.id);
  }

  /** Vereine, in denen der Nutzer eine Verwaltungsrolle hat (Vorstand, Kassenwart, Moderation). */
  async managedBy(userId: string): Promise<OrgSummary[]> {
    const rows = await this.db
      .select({ org: organizations })
      .from(orgMembers)
      .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
      .where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, "active"), inArray(orgMembers.role, ["admin", "treasurer", "moderator"])))
      .orderBy(organizations.name);
    return this.summaries(rows.map((r) => r.org));
  }

  async detail(slug: string, userId: string): Promise<OrgDetail> {
    const org = await this.requireBySlug(slug);
    const [summary] = await this.summaries([org]);
    const [membership] = await this.db
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, userId)))
      .limit(1);
    const [follow] = await this.db
      .select()
      .from(follows)
      .where(and(eq(follows.orgId, org.id), eq(follows.userId, userId)))
      .limit(1);
    return {
      ...summary,
      bannerId: org.bannerMediaId,
      publicPage: org.publicPage,
      viewer: {
        following: !!follow,
        membership: !membership ? "none" : membership.status === "active" ? "active" : "pending",
        role: membership?.status === "active" ? (membership.role as OrgRole) : null,
      },
    };
  }

  /** Vereinsprofil (Name, Kategorie, Ort, Ueber uns) aendern - nur Vorstand; die Adresse (Slug) bleibt. */
  async update(slug: string, actor: PublicUser, input: UpdateOrgInput): Promise<OrgDetail> {
    const org = await this.requireBySlug(slug);
    await this.requireAdmin(org.id, actor.id);
    await this.db
      .update(organizations)
      .set({ name: input.name, category: input.category, city: input.city, about: input.about })
      .where(eq(organizations.id, org.id));
    if (org.publicPage) await invalidatePublicOrg(this.cache, slug, true);
    return this.detail(slug, actor.id);
  }

  /** Oeffentliche Vereinsseite ein-/ausschalten - nur Vorstand. Cache wird sofort geleert. */
  async setPublicPage(slug: string, actor: PublicUser, enabled: boolean): Promise<OrgDetail> {
    const org = await this.requireBySlug(slug);
    if ((await this.activeRole(org.id, actor.id)) !== "admin") throw new ForbiddenException("Nur der Vorstand schaltet die öffentliche Vereinsseite um.");
    await this.db.update(organizations).set({ publicPage: enabled }).where(eq(organizations.id, org.id));
    await invalidatePublicOrg(this.cache, slug, true);
    return this.detail(slug, actor.id);
  }

  // --- Oeffentlicher Bereich (ohne Login, nur freigeschaltete Vereine) -------------

  /** Verein mit freigeschalteter oeffentlicher Seite, sonst undefined. Liefert nur unkritische Felder. */
  async publicBySlug(slug: string): Promise<(PublicOrgSummary & { id: string; about: string; bannerId: string | null }) | undefined> {
    const [org] = await this.db.select().from(organizations).where(and(eq(organizations.slug, slug), eq(organizations.publicPage, true))).limit(1);
    if (!org) return undefined;
    const [summary] = await this.publicSummaries([org]);
    return { ...summary, id: org.id, about: org.about, bannerId: org.bannerMediaId };
  }

  /** Vereinsfinder: nur freigeschaltete Vereine, alphabetisch, Seitengroesse vom Aufrufer (max. 30). */
  async publicList(query: PublicOrgQuery, size: number): Promise<PublicOrgSummary[]> {
    const term = query.q ? escapeLike(query.q) : "";
    const place = query.city ? escapeLike(query.city) : "";
    const rows = await this.db
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.publicPage, true),
          term ? or(ilike(organizations.name, `%${term}%`), ilike(organizations.about, `%${term}%`)) : undefined,
          place ? ilike(organizations.city, `%${place}%`) : undefined,
          query.category ? eq(organizations.category, query.category) : undefined,
          query.tag && isTagId(query.tag) ? sql`${organizations.tags} @> ARRAY[${query.tag}]::text[]` : undefined,
        ),
      )
      .orderBy(organizations.name, organizations.id)
      .limit(size)
      .offset(query.offset);
    return this.publicSummaries(rows);
  }

  private async publicSummaries(rows: OrgRow[]): Promise<PublicOrgSummary[]> {
    const full = await this.summaries(rows);
    return full.map((o) => ({ slug: o.slug, name: o.name, category: o.category, city: o.city, tags: o.tags, logoId: o.logoId, members: o.members }));
  }

  async follow(slug: string, userId: string, on: boolean): Promise<OrgDetail> {
    const org = await this.requireBySlug(slug);
    if (on) await this.db.insert(follows).values({ orgId: org.id, userId }).onConflictDoNothing();
    else await this.db.delete(follows).where(and(eq(follows.orgId, org.id), eq(follows.userId, userId)));
    return this.detail(slug, userId);
  }

  /** Mitgliedschaftsantrag; die Freigabe durch den Vorstand folgt im Modul "Verwaltung". */
  async requestMembership(slug: string, userId: string): Promise<OrgDetail> {
    const org = await this.requireBySlug(slug);
    // Schutz vor Antrags-Spam: abgelehnte Antraege werden geloescht und koennten sonst endlos wiederholt werden.
    const [existing] = await this.db.select({ status: orgMembers.status }).from(orgMembers).where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, userId))).limit(1);
    if (existing) throw new ConflictException("Du bist bereits Mitglied oder hast schon einen Antrag gestellt.");
    await enforceLimit(this.cache, `org:apply:${org.id}:${userId}`, 3, 30 * 86400, limitMessage("Mitgliedsanträge bei diesem Verein"));
    await enforceLimit(this.cache, `org:apply:${userId}`, 20, 86400, limitMessage("Mitgliedsanträge"));
    const inserted = await this.db
      .insert(orgMembers)
      .values({ orgId: org.id, userId, role: "member", status: "pending" })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) throw new ConflictException("Du bist bereits Mitglied oder hast schon einen Antrag gestellt.");
    const admins = await this.db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.role, "admin"), eq(orgMembers.status, "active")));
    await this.notifications.notify(
      admins.map((a) => a.userId),
      "membership_request",
      { orgSlug: org.slug, orgName: org.name },
    );
    return this.detail(slug, userId);
  }

  // --- Mitgliederverwaltung (nur Vorstand) -------------------------------------

  private async requireAdmin(orgId: string, userId: string, dbOrTx: DbOrTx = this.db) {
    if ((await this.activeRole(orgId, userId, dbOrTx)) !== "admin") {
      throw new ForbiddenException("Nur der Vorstand darf Mitglieder verwalten.");
    }
  }

  private async adminCount(orgId: string, dbOrTx: DbOrTx = this.db): Promise<number> {
    const [{ n }] = await dbOrTx
      .select({ n: sql<number>`count(*)::int` })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "admin"), eq(orgMembers.status, "active")));
    return n;
  }

  /** Datensparsam: nur Anzeigename, Rolle, Status. Stammdaten (Adresse etc.) folgen im Modul Verwaltung. */
  async members(slug: string, actor: PublicUser, status?: "pending" | "active"): Promise<MemberItem[]> {
    const org = await this.requireBySlug(slug);
    await this.requireAdmin(org.id, actor.id);
    const rows = await this.db
      .select({
        userId: orgMembers.userId,
        role: orgMembers.role,
        status: orgMembers.status,
        since: orgMembers.createdAt,
      })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, org.id), status ? eq(orgMembers.status, status) : undefined))
      .orderBy(orgMembers.createdAt)
      .limit(500);
    const ids = rows.map((r) => r.userId);
    const [names, handles] = await Promise.all([this.directory.names(ids), this.access.handles(ids)]);
    return rows.map((r) => ({
      ...r,
      name: names.get(r.userId) ?? "Gelöschter Nutzer",
      handle: handles.get(r.userId) ?? null,
      role: r.role as OrgRole,
      status: r.status as "pending" | "active",
      since: r.since.toISOString(),
    }));
  }

  async decide(slug: string, actor: PublicUser, targetId: string, decision: "approve" | "reject"): Promise<void> {
    const org = await this.requireBySlug(slug);
    await this.requireAdmin(org.id, actor.id);
    const key = and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, targetId));
    const [m] = await this.db.select().from(orgMembers).where(and(key, eq(orgMembers.status, "pending"))).limit(1);
    if (!m) throw new NotFoundException("Kein offener Antrag gefunden.");
    if (decision === "approve") await this.db.update(orgMembers).set({ status: "active" }).where(key);
    else await this.db.delete(orgMembers).where(key);
    await this.notifications.notify([targetId], "membership_decision", {
      orgSlug: org.slug,
      orgName: org.name,
      decision,
    });
  }

  /** Sperrt den Verein bis zum Ende der Transaktion (serialisiert Rollen-/Austrittsaenderungen, "letzter Vorstand"). */
  private async lockOrg(tx: DbOrTx, orgId: string) {
    await tx.execute(sql`select id from social.organizations where id = ${orgId} for update`);
  }

  async setRole(slug: string, actor: PublicUser, targetId: string, role: OrgRole): Promise<void> {
    const org = await this.requireBySlug(slug);
    await this.db.transaction(async (tx) => {
      await this.lockOrg(tx, org.id);
      await this.requireAdmin(org.id, actor.id, tx);
      const current = await this.activeRole(org.id, targetId, tx); // erst nach der Sperre lesen
      if (!current) throw new NotFoundException("Aktives Mitglied nicht gefunden.");
      if (current === "admin" && role !== "admin" && (await this.adminCount(org.id, tx)) <= 1) {
        throw new BadRequestException("Der Verein braucht mindestens einen Vorstand.");
      }
      await tx
        .update(orgMembers)
        .set({ role })
        .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, targetId)));
    });
  }

  /** Austritt (selbst) oder Entfernen (Vorstand). */
  async removeMember(slug: string, actor: PublicUser, targetId: string): Promise<void> {
    const org = await this.requireBySlug(slug);
    await this.db.transaction(async (tx) => {
      await this.lockOrg(tx, org.id);
      if (targetId !== actor.id) await this.requireAdmin(org.id, actor.id, tx);
      const key = and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, targetId));
      const [m] = await tx.select().from(orgMembers).where(key).limit(1);
      if (!m) throw new NotFoundException("Mitglied nicht gefunden.");
      if (m.role === "admin" && m.status === "active" && (await this.adminCount(org.id, tx)) <= 1) {
        throw new BadRequestException("Der letzte Vorstand kann den Verein nicht verlassen.");
      }
      await tx.delete(orgMembers).where(key);
    });
    // Nach dem Commit: Stammdaten, Teams, interne Zusagen, Gruppen-Chats (Datenschutz). Wirft nie.
    await this.events.emitLeave(org.id, targetId);
  }

  /** Namen aktiver Mitglieder, nur fuer Vorstand und Moderation - ohne Rollen, E-Mails oder Status. */
  async memberNames(slug: string, actor: PublicUser): Promise<OrgMemberName[]> {
    const org = await this.requireBySlug(slug);
    const role = await this.activeRole(org.id, actor.id);
    if (role !== "admin" && role !== "moderator") throw new ForbiddenException("Nur Vorstand und Moderation sehen die Mitgliederliste.");
    const ids = await this.allActiveMemberIds(org.id);
    const names = await this.directory.names(ids);
    return ids
      .filter((id) => names.has(id))
      .map((id) => ({ userId: id, name: names.get(id)! }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  // --- Kontoloeschung (Variante A) ----------------------------------------------------

  /** Vereine, in denen der Nutzer einziger aktiver Vorstand ist, mit Anzahl weiterer aktiver Mitglieder. */
  async soleAdminOrgs(userId: string): Promise<{ id: string; slug: string; name: string; otherActive: number }[]> {
    const res: any = await this.db.execute(sql`
      select o.id, o.slug, o.name,
        (select count(*)::int from social.org_members x where x.org_id = o.id and x.status = 'active' and x.user_id <> ${userId}) as other_active
      from social.org_members m
      join social.organizations o on o.id = m.org_id
      where m.user_id = ${userId} and m.status = 'active' and m.role = 'admin'
        and not exists (select 1 from social.org_members a where a.org_id = o.id and a.status = 'active' and a.role = 'admin' and a.user_id <> ${userId})
      order by o.name`);
    const rows: { id: string; slug: string; name: string; other_active: number }[] = Array.isArray(res) ? res : res.rows ?? [];
    return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, otherActive: Number(r.other_active) }));
  }

  /**
   * Loescht einen Verein, wenn ausser `userId` niemand mehr aktives Mitglied ist (Kontoloeschung des einzigen Vorstands).
   * Kaskade in social (Beitraege, Termine, Teams, Einladungen); andere Bereiche raeumen per OrgEvents auf.
   * Finalisierte Rechnungen (billing) bleiben als Aufbewahrungsdaten erhalten, nur Entwuerfe werden geloescht.
   */
  async deleteIfAbandoned(orgId: string, userId: string): Promise<boolean> {
    const after = await this.db.transaction(async (tx) => {
      await this.lockOrg(tx, orgId);
      const [other] = await tx
        .select({ userId: orgMembers.userId })
        .from(orgMembers)
        .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.status, "active"), ne(orgMembers.userId, userId)))
        .limit(1);
      if (other) return null;
      const cbs = await this.events.runDeleting(orgId, tx);
      const deleted = await tx
        .delete(organizations)
        .where(and(eq(organizations.id, orgId), sql`not exists (select 1 from social.org_members m where m.org_id = ${orgId} and m.status = 'active' and m.user_id <> ${userId})`))
        .returning({ id: organizations.id, slug: organizations.slug });
      if (deleted.length === 0) return null;
      return { cbs, slug: deleted[0].slug };
    });
    if (!after) return false;
    // oeffentliche Seite und Finder sofort leeren (sonst bis zu 60 s aus dem Cache)
    await invalidatePublicOrg(this.cache, after.slug, true);
    for (const cb of after.cbs) {
      try {
        await cb();
      } catch {
        this.log.error(`Nacharbeit nach Vereinsloeschung fehlgeschlagen (Verein ${orgId}).`);
      }
    }
    await this.events.emitOrgDeleted(orgId);
    return true;
  }

  /** Ausstellerdaten fuer Rechnungen (Stand beim Finalisieren). */
  async issuerData(orgId: string): Promise<{ name: string; city: string; address: string; iban: string; taxInfo: string }> {
    const [o] = await this.db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!o) throw new NotFoundException("Verein nicht gefunden.");
    return { name: o.name, city: o.city, address: o.address, iban: o.iban, taxInfo: o.taxInfo };
  }

  // --- Kontakte (fuer den Chat) ---------------------------------------------------

  /**
   * Wer darf wem schreiben? (1) Beide sind aktive Mitglieder desselben Vereins oder
   * (2) der Empfaenger ist Vorstand/Moderation eines Vereins, dem der Absender folgt oder angehoert.
   * Verhindert unerwuenschte Nachrichten von Fremden.
   */
  async canContact(userId: string, otherId: string): Promise<boolean> {
    const [mine, theirs] = await Promise.all([
      this.db.select({ orgId: orgMembers.orgId }).from(orgMembers).where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, "active"))),
      this.db.select({ orgId: orgMembers.orgId, role: orgMembers.role }).from(orgMembers).where(and(eq(orgMembers.userId, otherId), eq(orgMembers.status, "active"))),
    ]);
    const myOrgs = new Set(mine.map((m) => m.orgId));
    if (theirs.some((t) => myOrgs.has(t.orgId))) return true;
    const staff = theirs.filter((t) => t.role === "admin" || t.role === "moderator").map((t) => t.orgId);
    if (staff.length === 0) return false;
    const [followed] = await this.db.select().from(follows).where(and(eq(follows.userId, userId), inArray(follows.orgId, staff))).limit(1);
    return !!followed;
  }

  /** Personen, die der Nutzer anschreiben darf (mit Vereinsnamen als Kontext). */
  async contactCandidates(userId: string): Promise<{ userId: string; context: string }[]> {
    const mine = await this.db.select({ orgId: orgMembers.orgId }).from(orgMembers).where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, "active")));
    const followed = await this.db.select({ orgId: follows.orgId }).from(follows).where(eq(follows.userId, userId));
    const myOrgIds = mine.map((m) => m.orgId);
    const followIds = followed.map((f) => f.orgId).filter((id) => !myOrgIds.includes(id));
    const out = new Map<string, string>();
    if (myOrgIds.length) {
      const rows = await this.db
        .select({ userId: orgMembers.userId, org: organizations.name })
        .from(orgMembers)
        .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
        .where(and(inArray(orgMembers.orgId, myOrgIds), eq(orgMembers.status, "active")))
        .limit(400);
      rows.filter((r) => r.userId !== userId).forEach((r) => out.set(r.userId, r.org));
    }
    if (followIds.length) {
      const rows = await this.db
        .select({ userId: orgMembers.userId, org: organizations.name })
        .from(orgMembers)
        .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
        .where(and(inArray(orgMembers.orgId, followIds), eq(orgMembers.status, "active"), inArray(orgMembers.role, ["admin", "moderator"])))
        .limit(200);
      rows.filter((r) => r.userId !== userId && !out.has(r.userId)).forEach((r) => out.set(r.userId, `${r.org} (Vorstand)`));
    }
    return [...out].map(([id, context]) => ({ userId: id, context }));
  }

  /** Aus den uebergebenen IDs nur die aktiven Mitglieder des Vereins. */
  async activeMemberIds(orgId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.status, "active"), inArray(orgMembers.userId, ids)));
    return rows.map((r) => r.userId);
  }

  async slugOf(orgId: string): Promise<string | null> {
    const [o] = await this.db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    return o?.slug ?? null;
  }

  async findBySlug(slug: string): Promise<OrgRow | undefined> {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    return org;
  }

  async requireBySlug(slug: string): Promise<OrgRow> {
    const org = await this.findBySlug(slug);
    if (!org) throw new NotFoundException("Verein nicht gefunden.");
    return org;
  }

  /** Aktive Rolle des Nutzers im Verein (null = kein aktives Mitglied). */
  async activeRole(orgId: string, userId: string, dbOrTx: DbOrTx = this.db): Promise<OrgRole | null> {
    const [m] = await dbOrTx
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId), eq(orgMembers.status, "active")))
      .limit(1);
    return (m?.role as OrgRole) ?? null;
  }

  /** IDs aller aktiven Mitglieder (Rechnungsempfaenger, Namensliste, Chat-Kandidaten), ohne feste Grenze. */
  async allActiveMemberIds(orgId: string): Promise<string[]> {
    return (await this.allActiveMembersWithRole(orgId)).map((m) => m.userId);
  }

  /** Anzahl offener Mitgliedsantraege (fuer das Dashboard). */
  async pendingCount(orgId: string): Promise<number> {
    const [{ n }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.status, "pending")));
    return n;
  }

  /**
   * Alle aktiven Mitglieder mit Rolle OHNE feste Grenze (Beitragslauf, Mitgliedsprofile, Export), blockweise per
   * Keyset ueber den Primaerschluessel (org_id, user_id). SKALIERUNG: haelt alle IDs im Speicher (bei 50.000 Mitgliedern
   * wenige MB); darueber Verarbeitung je Block an die Aufrufer durchreichen.
   */
  async allActiveMembersWithRole(orgId: string, block = 1000): Promise<{ userId: string; role: OrgRole; since: Date }[]> {
    const out: { userId: string; role: OrgRole; since: Date }[] = [];
    let after: string | null = null;
    for (;;) {
      const conds = [eq(orgMembers.orgId, orgId), eq(orgMembers.status, "active")];
      if (after) conds.push(gt(orgMembers.userId, after));
      const rows = await this.db
        .select({ userId: orgMembers.userId, role: orgMembers.role, since: orgMembers.createdAt })
        .from(orgMembers)
        .where(and(...conds))
        .orderBy(asc(orgMembers.userId))
        .limit(block);
      for (const r of rows) out.push({ userId: r.userId, role: r.role as OrgRole, since: r.since });
      if (rows.length < block) break;
      after = rows[rows.length - 1].userId;
    }
    return out.sort((a, b) => a.since.getTime() - b.since.getTime());
  }

  /** Slug und Name zu Verein-IDs (Lesezugang fuer andere Bereiche, z. B. billing). */
  async lookupByIds(ids: string[]): Promise<Map<string, { slug: string; name: string; city: string }>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.db.select().from(organizations).where(inArray(organizations.id, unique));
    return new Map(rows.map((o) => [o.id, { slug: o.slug, name: o.name, city: o.city }]));
  }

  private async summaries(rows: OrgRow[]): Promise<OrgSummary[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [followerCounts, memberCounts] = await Promise.all([
      this.db
        .select({ orgId: follows.orgId, n: sql<number>`count(*)::int` })
        .from(follows)
        .where(inArray(follows.orgId, ids))
        .groupBy(follows.orgId),
      this.db
        .select({ orgId: orgMembers.orgId, n: sql<number>`count(*)::int` })
        .from(orgMembers)
        .where(and(inArray(orgMembers.orgId, ids), eq(orgMembers.status, "active")))
        .groupBy(orgMembers.orgId),
    ]);
    const f = new Map(followerCounts.map((r) => [r.orgId, r.n]));
    const m = new Map(memberCounts.map((r) => [r.orgId, r.n]));
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      category: r.category,
      tags: r.tags,
      city: r.city,
      about: r.about,
      followers: f.get(r.id) ?? 0,
      members: m.get(r.id) ?? 0,
      logoId: r.logoMediaId,
    }));
  }
}
