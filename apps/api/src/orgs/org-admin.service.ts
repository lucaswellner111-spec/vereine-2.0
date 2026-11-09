import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
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
import { OrgsService } from "./orgs.service";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
type InviteRow = typeof orgInvites.$inferSelect;
const inviteKey = () => derivedKey("invite", "Einladungslinks sind auf diesem Server nicht konfiguriert.");

/**
 * Vereinsstammdaten fuer Rechnungen und Einladungslinks.
 * Einladungslinks ersetzen den Import von Mitgliederlisten: Personen treten selbst bei (Datenminimierung,
 * keine Konten ohne Zustimmung). Der Token ist 256 Bit lang; gesucht wird ueber den SHA-256-Hash, zusaetzlich liegt er
 * AES-256-GCM-verschluesselt vor (Teilschluessel per HKDF), damit der Vorstand den Link erneut anzeigen kann (protokolliert).
 */
@Injectable()
export class OrgAdminService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(AuditService) private readonly audit: AuditService,
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
    return { id: r.id, maxUses: r.maxUses, uses: r.uses, expiresAt: r.expiresAt.toISOString(), createdAt: r.createdAt.toISOString(), status, linkAvailable: !!r.tokenEnc };
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

  /** Ohne konfigurierten Schluessel (Produktion) bleibt die Einladung nutzbar, nur nicht erneut anzeigbar. */
  private encryptToken(token: string): string | null {
    try {
      return encryptGcm(inviteKey(), token);
    } catch {
      return null;
    }
  }

  async listInvites(user: PublicUser, slug: string): Promise<InviteItem[]> {
    const org = await this.requireAdmin(user, slug);
    const rows = await this.db.select().from(orgInvites).where(eq(orgInvites.orgId, org.id)).orderBy(desc(orgInvites.createdAt)).limit(50);
    return rows.map((r) => this.item(r));
  }

  async createInvite(user: PublicUser, slug: string, input: CreateInviteInput): Promise<CreatedInvite> {
    const org = await this.requireAdmin(user, slug);
    const [open] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(orgInvites)
      .where(and(eq(orgInvites.orgId, org.id), isNull(orgInvites.revokedAt), gt(orgInvites.expiresAt, new Date())));
    if (open.n >= 20) throw new BadRequestException("Es gibt bereits 20 aktive Einladungslinks. Widerrufe zuerst einen.");
    const token = randomBytes(32).toString("base64url");
    const [row] = await this.db
      .insert(orgInvites)
      .values({
        orgId: org.id,
        tokenHash: sha256(token),
        tokenEnc: this.encryptToken(token),
        maxUses: input.maxUses,
        expiresAt: new Date(Date.now() + input.expiresInDays * 86400_000),
        createdBy: user.id,
      })
      .returning();
    return { ...this.item(row), token };
  }

  /** Link einer aktiven Einladung erneut anzeigen (nur Vorstand, Zugriff im Audit-Protokoll). */
  async inviteLink(user: PublicUser, slug: string, id: string): Promise<InviteLink> {
    const org = await this.requireAdmin(user, slug);
    const [row] = await this.db.select().from(orgInvites).where(and(eq(orgInvites.id, id), eq(orgInvites.orgId, org.id))).limit(1);
    if (!row || this.item(row).status !== "active") throw new NotFoundException("Einladung nicht gefunden oder nicht mehr aktiv.");
    const gone = new ConflictException("Dieser Link kann nicht erneut angezeigt werden. Bitte neu erstellen.");
    if (!row.tokenEnc) throw gone;
    const key = inviteKey(); // Konfigurationsfehler (Produktion ohne Schluessel) nicht als "neu erstellen" melden
    let token: string;
    try {
      token = decryptGcm(key, row.tokenEnc);
    } catch {
      throw gone; // z. B. Schluessel gewechselt
    }
    await this.audit.record(user.id, "org.invite.link.viewed", { orgId: org.id, inviteId: row.id });
    return { token };
  }

  async revokeInvite(user: PublicUser, slug: string, id: string): Promise<void> {
    const org = await this.requireAdmin(user, slug);
    const res = await this.db
      .update(orgInvites)
      .set({ revokedAt: new Date() })
      .where(and(eq(orgInvites.id, id), eq(orgInvites.orgId, org.id), isNull(orgInvites.revokedAt)))
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
    return { orgName: org.name, orgSlug: org.slug, alreadyMember: false };
  }
}
