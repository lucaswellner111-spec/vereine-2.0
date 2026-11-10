import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type {
  CreatedInvite,
  CreateInviteInput,
  InviteInfo,
  InviteItem,
  InviteLink,
  OrgBillingProfile,
  OrgBillingProfileInput,
  PublicUser,
} from "@vereine/shared";
import { AuditService } from "../auth/audit.service";
import { ago, purgeInRounds, RETENTION, RETENTION_BATCH } from "../common/retention";
import { decryptGcm, derivedKey, encryptGcm } from "../common/secret-key";
import { DB, type Database } from "../db/db.module";
import { follows, orgInvites, orgMembers, organizations } from "../db/schema";
import { appLink } from "../common/app-url";
import { addressHash } from "../mail/mail-limits";
import { MailService } from "../mail/mail.service";
import { OrgEvents } from "./org-events";
import { OrgsService } from "./orgs.service";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
type InviteRow = typeof orgInvites.$inferSelect;
const inviteKey = () => derivedKey("invite", "Einladungslinks sind auf diesem Server nicht konfiguriert.");

/**
 * Vereinsstammdaten fuer Rechnungen und Einladungslinks.
 * Personen treten ueber Einladungen selbst bei (Datenminimierung, keine Konten ohne Zustimmung); auch der
 * Mitglieder-Import (members/member-import.service.ts) verschickt nur persoenliche Einladungen (purpose "import"). Der Token ist 256 Bit lang; gesucht wird ueber den SHA-256-Hash, zusaetzlich liegt er
 * AES-256-GCM-verschluesselt vor (Teilschluessel per HKDF), damit der Vorstand den Link erneut anzeigen kann (protokolliert).
 */
@Injectable()
export class OrgAdminService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(OrgEvents) private readonly events: OrgEvents,
  ) {}

  // --- Stammdaten ---------------------------------------------------------------

  async billingProfile(user: PublicUser, slug: string): Promise<OrgBillingProfile> {
    const org = await this.orgs.requireBySlug(slug);
    const role = await this.orgs.activeRole(org.id, user.id);
    if (role !== "admin" && role !== "treasurer") throw new ForbiddenException("Nur Vorstand und Kassenwart sehen die Stammdaten.");
    return { address: org.address, iban: org.iban, taxInfo: org.taxInfo };
  }

  async setBillingProfile(user: PublicUser, slug: string, input: OrgBillingProfileInput): Promise<OrgBillingProfile> {
    const org = await this.orgs.requireBySlug(slug);
    if ((await this.orgs.activeRole(org.id, user.id)) !== "admin") throw new ForbiddenException("Nur der Vorstand ändert die Stammdaten.");
    await this.db.update(organizations).set(input).where(eq(organizations.id, org.id));
    return input;
  }

  // --- Einladungslinks ------------------------------------------------------------

  private async requireAdmin(user: PublicUser, slug: string) {
    const org = await this.orgs.requireBySlug(slug);
    if ((await this.orgs.activeRole(org.id, user.id)) !== "admin") throw new ForbiddenException("Nur der Vorstand verwaltet Einladungen.");
    return org;
  }

  private item(r: InviteRow): InviteItem {
    const status: InviteItem["status"] = r.revokedAt
      ? "revoked"
      : r.expiresAt <= new Date()
        ? "expired"
        : r.uses >= r.maxUses
          ? "used_up"
          : "active";
    return { id: r.id, maxUses: r.maxUses, uses: r.uses, expiresAt: r.expiresAt.toISOString(), createdAt: r.createdAt.toISOString(), status };
  }

  /** Kontoloeschung: Verweis auf die erstellende Person entfernen (Einladung bleibt fuer den Verein gueltig). */
  async eraseUser(userId: string): Promise<void> {
    await this.db.update(orgInvites).set({ createdBy: null }).where(eq(orgInvites.createdBy, userId));
  }

  /** Loeschfrist: 30 Tage nach Ablauf oder Widerruf (Job privacy.retention), blockweise. */
  purgeExpiredInvites(): Promise<number> {
    return purgeInRounds(async () => {
      const ids = this.db
        .select({ id: orgInvites.id })
        .from(orgInvites)
        .where(or(lt(orgInvites.expiresAt, ago(RETENTION.invites)), lt(orgInvites.revokedAt, ago(RETENTION.invites))))
        .limit(RETENTION_BATCH);
      return (await this.db.delete(orgInvites).where(inArray(orgInvites.id, ids)).returning({ id: orgInvites.id })).length;
    });
  }


  async listInvites(user: PublicUser, slug: string): Promise<InviteItem[]> {
    const org = await this.requireAdmin(user, slug);
    // Widerrufene ausblenden: "Widerrufen" entfernt den Link aus der Liste (Loeschung nach Frist per Job).
    const rows = await this.db.select().from(orgInvites).where(and(eq(orgInvites.orgId, org.id), eq(orgInvites.purpose, "link"), isNull(orgInvites.revokedAt))).orderBy(desc(orgInvites.createdAt)).limit(50);
    return rows.map((r) => this.item(r));
  }

  async createInvite(user: PublicUser, slug: string, input: CreateInviteInput): Promise<CreatedInvite> {
    const org = await this.requireAdmin(user, slug);
    const [open] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(orgInvites)
      .where(and(eq(orgInvites.orgId, org.id), eq(orgInvites.purpose, "link"), isNull(orgInvites.revokedAt), gt(orgInvites.expiresAt, new Date())));
    if (open.n >= 20) throw new BadRequestException("Es gibt bereits 20 aktive Einladungslinks. Widerrufe zuerst einen.");
    const token = randomBytes(32).toString("base64url");
    // Ohne Schluessel (Produktion) 503 statt einer Einladung, deren Link spaeter nicht mehr anzeigbar ist.
    const tokenEnc = encryptGcm(inviteKey(), token);
    const [row] = await this.db
      .insert(orgInvites)
      .values({
        orgId: org.id,
        tokenHash: sha256(token),
        tokenEnc,
        maxUses: input.maxUses,
        expiresAt: new Date(Date.now() + input.expiresInDays * 86400_000),
        createdBy: user.id,
      })
      .returning();
    return { ...this.item(row), token };
  }

  /**
   * Persoenliche Einladung fuer den Mitglieder-Import (einmalig, purpose "import", nicht in der Liste, ohne 20er-Grenze).
   * Nur fuer interne Dienste; Rechte prueft der Aufrufer.
   */
  async createImportInvite(orgId: string, createdBy: string | null, validDays: number): Promise<{ id: string; token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + validDays * 86400_000);
    const [row] = await this.db
      .insert(orgInvites)
      .values({ orgId, tokenHash: sha256(token), tokenEnc: encryptGcm(inviteKey(), token), maxUses: 1, purpose: "import", expiresAt, createdBy })
      .returning({ id: orgInvites.id });
    return { id: row.id, token, expiresAt };
  }

  /** Persoenliche Import-Einladungen widerrufen (Vorstand entfernt eine Vormerkung) oder verwerfen (Mail nicht eingereiht). */
  async revokeImportInvites(orgId: string, ids: string[], opts: { delete?: boolean } = {}): Promise<void> {
    if (ids.length === 0) return;
    const where = and(eq(orgInvites.orgId, orgId), eq(orgInvites.purpose, "import"), inArray(orgInvites.id, ids));
    if (opts.delete) await this.db.delete(orgInvites).where(where);
    else await this.db.update(orgInvites).set({ revokedAt: new Date() }).where(and(where, isNull(orgInvites.revokedAt)));
  }

  /** Link einer aktiven Einladung erneut anzeigen (nur Vorstand, Zugriff im Audit-Protokoll). */
  async inviteLink(user: PublicUser, slug: string, id: string): Promise<InviteLink> {
    const org = await this.requireAdmin(user, slug);
    const token = await this.activeToken(org.id, id);
    await this.audit.record(user.id, "org.invite.link.viewed", { orgId: org.id, inviteId: id });
    return { token };
  }

  /**
   * Einladung per Mail (nur Vorstand). Die Adresse wird nicht gespeichert und nicht protokolliert. Limits: 100 je Verein
   * und Tag, 20 je Konto und Tag, je Empfaenger 5/Stunde. Hat sich die Adresse von Einladungen abgemeldet, wird still
   * nichts verschickt (der Vorstand erfaehrt nicht, wer sich abgemeldet hat).
   */
  async mailInvite(user: PublicUser, slug: string, id: string, email: string): Promise<void> {
    const org = await this.requireAdmin(user, slug);
    const token = await this.activeToken(org.id, id);
    const result = await this.mail.send(
      email,
      "invite",
      { orgName: org.name, link: appLink(`/einladung/${token}`), inviterName: user.displayName },
      { actorId: user.id, orgId: org.id, unsubscribe: { k: "invite", h: addressHash(email) } },
    );
    const limited: Record<string, string> = {
      "limited:org": "Heute wurden für diesen Verein schon 100 Einladungen per Mail verschickt. Bitte versuche es morgen erneut oder teile den Link.",
      "limited:actor": "Du hast heute schon 20 Mails ausgelöst. Bitte versuche es morgen erneut oder teile den Link.",
      "limited:recipient": "An diese Adresse wurden gerade schon mehrere Mails geschickt. Bitte versuche es später erneut.",
    };
    if (limited[result]) throw new HttpException({ message: limited[result], statusCode: 429 }, 429);
    await this.audit.record(user.id, "org.invite.mailed", { orgId: org.id, inviteId: id });
  }

  /** Token einer aktiven Einladung entschluesseln (fuer Anzeige und Mail). */
  private async activeToken(orgId: string, id: string): Promise<string> {
    const [row] = await this.db.select().from(orgInvites).where(and(eq(orgInvites.id, id), eq(orgInvites.orgId, orgId))).limit(1);
    if (!row || row.purpose !== "link" || this.item(row).status !== "active") throw new NotFoundException("Einladung nicht gefunden oder nicht mehr aktiv.");
    const gone = new ConflictException("Dieser Link kann nicht erneut angezeigt werden. Bitte neu erstellen.");
    const key = inviteKey(); // Konfigurationsfehler (Produktion ohne Schluessel) nicht als "neu erstellen" melden
    let token: string;
    try {
      token = decryptGcm(key, row.tokenEnc);
    } catch {
      throw gone; // z. B. Schluessel gewechselt
    }
    return token;
  }

  async revokeInvite(user: PublicUser, slug: string, id: string): Promise<void> {
    const org = await this.requireAdmin(user, slug);
    const res = await this.db
      .update(orgInvites)
      .set({ revokedAt: new Date() })
      .where(and(eq(orgInvites.id, id), eq(orgInvites.orgId, org.id), eq(orgInvites.purpose, "link"), isNull(orgInvites.revokedAt)))
      .returning({ id: orgInvites.id });
    if (res.length === 0) throw new NotFoundException("Einladung nicht gefunden.");
  }

  private async findUsable(token: string): Promise<InviteRow> {
    const [row] = await this.db.select().from(orgInvites).where(eq(orgInvites.tokenHash, sha256(token))).limit(1);
    // Einheitliche Meldung: Ob ein Token nie existierte oder abgelaufen ist, soll nicht erkennbar sein.
    if (!row || this.item(row).status !== "active") throw new NotFoundException("Dieser Einladungslink ist ungültig oder abgelaufen.");
    return row;
  }

  async info(user: PublicUser, token: string): Promise<InviteInfo> {
    const row = await this.findUsable(token);
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, row.orgId)).limit(1);
    const role = await this.orgs.activeRole(row.orgId, user.id);
    return { orgName: org.name, orgSlug: org.slug, alreadyMember: !!role };
  }

  /** Tritt dem Verein bei (aktives Mitglied, ohne weitere Freigabe) und folgt ihm. */
  async accept(user: PublicUser, token: string): Promise<InviteInfo> {
    const row = await this.findUsable(token);
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, row.orgId)).limit(1);
    if (await this.orgs.activeRole(row.orgId, user.id)) return { orgName: org.name, orgSlug: org.slug, alreadyMember: true };

    await this.db.transaction(async (tx) => {
      // Atomar: nur zaehlen, solange noch Plaetze frei und der Link gueltig ist (parallele Annahmen).
      const claimed = await tx
        .update(orgInvites)
        .set({ uses: sql`${orgInvites.uses} + 1` })
        .where(and(eq(orgInvites.id, row.id), isNull(orgInvites.revokedAt), gt(orgInvites.expiresAt, new Date()), lt(orgInvites.uses, orgInvites.maxUses)))
        .returning({ id: orgInvites.id });
      if (claimed.length === 0) throw new NotFoundException("Dieser Einladungslink ist ungültig oder abgelaufen.");
      await tx
        .insert(orgMembers)
        .values({ orgId: row.orgId, userId: user.id, role: "member", status: "active" })
        .onConflictDoUpdate({ target: [orgMembers.orgId, orgMembers.userId], set: { status: "active" } });
      await tx.insert(follows).values({ orgId: row.orgId, userId: user.id }).onConflictDoNothing();
    });
    await this.events.emitInviteAccepted(row.orgId, user.id, row.id); // z. B. Stammdaten aus dem Mitglieder-Import uebernehmen
    return { orgName: org.name, orgSlug: org.slug, alreadyMember: false };
  }
}
