import { ConflictException, ForbiddenException, Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { and, desc, eq, isNotNull, lt } from "drizzle-orm";
import {
  CONSENT_PURPOSES,
  LEGAL_VERSION,
  type ConsentPurpose,
  type ConsentState,
  type PublicUser,
  type SetConsentInput,
} from "@vereine/shared";
import { AuthService } from "../auth/auth.service";
import { BillingService } from "../billing/billing.service";
import { ChatService } from "../chat/chat.service";
import { MediaService } from "../media/media.service";
import { MembersService } from "../members/members.service";
import { DB, type Database } from "../db/db.module";
import { auditLog, comments, consents, follows, orgMembers, posts, sessions, users } from "../db/schema";
import { PostsService } from "../posts/posts.service";
import { EventsService } from "../events/events.service";
import { JobsService } from "../jobs/jobs.service";
import { OrgsService } from "../orgs/orgs.service";

/** Nach dieser Zeit schliesst der Job `privacy.erase-pending` abgebrochene Kontoloeschungen ab. */
const ERASE_GRACE_MS = 15 * 60_000;

/**
 * Datenschutz (Einwilligungen, Auskunft, Loeschung). Dokumentierte Ausnahme der Bereichsgrenzen (db/boundaries.spec.ts):
 * liest/loescht fuer Auskunft und Kontoloeschung direkt eine feste Liste von identity-/social-Tabellen; alles andere
 * laeuft ueber die Dienste der Bereiche (Chat, Medien, Mitglieder, Rechnungen, Vereine).
 */
@Injectable()
export class PrivacyService implements OnModuleInit {
  private readonly log = new Logger("PrivacyService");

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(MediaService) private readonly mediaSvc: MediaService,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(PostsService) private readonly postsSvc: PostsService,
  ) {}

  onModuleInit() {
    // Schliesst Loeschungen ab, deren Schritte nach der Sperre abgebrochen sind (idempotent).
    this.jobs.define("privacy.erase-pending", async () => void (await this.erasePending()));
    this.jobs.every("privacy.erase-pending", 60 * 60 * 1000);
  }

  /** Neuester Eintrag je Zweck; Zwecke ohne Eintrag gelten als nicht erteilt. */
  async getConsents(userId: string): Promise<ConsentState[]> {
    const rows = await this.db
      .select()
      .from(consents)
      .where(eq(consents.userId, userId))
      .orderBy(desc(consents.createdAt));
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!latest.has(row.purpose)) latest.set(row.purpose, row);
    return CONSENT_PURPOSES.map((purpose: ConsentPurpose) => {
      const row = latest.get(purpose);
      return {
        purpose,
        granted: row?.granted ?? false,
        version: row?.version ?? LEGAL_VERSION,
        updatedAt: (row?.createdAt ?? new Date(0)).toISOString(),
      };
    });
  }

  async setConsent(userId: string, input: SetConsentInput): Promise<ConsentState[]> {
    await this.db.insert(consents).values({
      userId,
      purpose: input.purpose,
      granted: input.granted,
      version: LEGAL_VERSION,
    });
    await this.db.insert(auditLog).values({
      userId,
      action: input.granted ? "consent.granted" : "consent.withdrawn",
      meta: { purpose: input.purpose },
    });
    return this.getConsents(userId);
  }

  /** Auskunft/Datenportabilitaet (Art. 15, 20 DSGVO). */
  async exportData(user: PublicUser) {
    const [consentHistory, audit, sessionRows, ownPosts, ownComments, followed, memberships] = await Promise.all([
      this.db.select().from(consents).where(eq(consents.userId, user.id)),
      this.db.select().from(auditLog).where(eq(auditLog.userId, user.id)),
      this.db.select().from(sessions).where(eq(sessions.userId, user.id)),
      this.db.select().from(posts).where(eq(posts.authorId, user.id)),
      this.db.select().from(comments).where(eq(comments.authorId, user.id)),
      this.db.select().from(follows).where(eq(follows.userId, user.id)),
      this.db.select().from(orgMembers).where(eq(orgMembers.userId, user.id)),
    ]);
    const chatData = await this.chat.exportUser(user.id);
    return {
      exportedAt: new Date().toISOString(),
      profile: user,
      consents: consentHistory.map((c) => ({
        purpose: c.purpose,
        granted: c.granted,
        version: c.version,
        at: c.createdAt.toISOString(),
      })),
      activeSessions: sessionRows.map((s) => ({
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
      posts: ownPosts.map((p) => ({ body: p.body, kind: p.kind, orgId: p.orgId, at: p.createdAt.toISOString(), deleted: !!p.deletedAt })),
      comments: ownComments.map((c) => ({ body: c.body, postId: c.postId, at: c.createdAt.toISOString() })),
      follows: followed.map((f) => ({ orgId: f.orgId, at: f.createdAt.toISOString() })),
      memberships: memberships.map((m) => ({ orgId: m.orgId, role: m.role, status: m.status })),
      events: await this.events.exportFor(user.id),
      pollVotes: await this.postsSvc.exportVotes(user.id),
      chat: chatData,
      media: await this.mediaSvc.countFor(user.id),
      invoices: await this.billing.exportFor(user.id),
      memberData: await this.members.exportFor(user.id),
      activityLog: audit.map((a) => ({
        action: a.action,
        at: a.createdAt.toISOString(),
        meta: a.meta,
      })),
    };
  }

  /**
   * Loeschung (Art. 17). Ablauf: (1) Passwort und Vorstandsregel pruefen, (2) Konto sofort sperren (deleted_at,
   * alle Sitzungen weg), (3) Daten in allen Bereichen loeschen (idempotent). Bricht (3) ab, ist das Konto trotzdem
   * gesperrt und der Job `privacy.erase-pending` schliesst die Loeschung ab.
   */
  async deleteAccount(user: PublicUser, password: string): Promise<void> {
    if (!(await this.auth.verifyPassword(user.id, password))) {
      throw new ForbiddenException("Passwort ist falsch.");
    }
    // Einziger Vorstand eines Vereins mit weiteren Mitgliedern: erst Rolle uebergeben (sonst bliebe der Verein fuehrungslos).
    const blocking = (await this.orgs.soleAdminOrgs(user.id)).filter((o) => o.otherActive > 0);
    if (blocking.length) {
      const names = blocking.map((o) => `„${o.name}“`).join(", ");
      throw new ConflictException(`Du bist einziger Vorstand von ${names}. Übertrage die Vorstandsrolle (Verwaltung → Mitglieder), bevor du dein Konto löschst.`);
    }
    await this.auth.beginAccountDeletion(user.id);
    try {
      await this.eraseEverything(user.id);
    } catch {
      this.log.error("Kontoloeschung unvollstaendig, wird vom Job privacy.erase-pending abgeschlossen.");
    }
  }

  /**
   * Alle Daten des (bereits gesperrten) Kontos loeschen. Idempotent, darf mehrfach laufen. Vereine, deren einziges
   * aktives Mitglied die Person ist, werden mitgeloescht (Variante A; finalisierte Rechnungen bleiben erhalten).
   */
  async eraseEverything(userId: string): Promise<void> {
    await this.chat.eraseUser(userId);
    await this.members.eraseUser(userId); // Mitgliederstammdaten in allen Vereinen
    await this.billing.anonymizeRecipient(userId); // Rechnungen bleiben (GoBD), aber ohne Personenbezug
    for (const org of await this.orgs.soleAdminOrgs(userId)) {
      if (org.otherActive === 0) await this.orgs.deleteIfAbandoned(org.id, userId);
    }
    await this.mediaSvc.eraseUser(userId); // Bilddateien (Zeilen folgen per Kaskade)
    await this.db.transaction(async (tx) => {
      // Protokoll bleibt ohne Personenbezug (userId wird entkoppelt).
      await tx.update(auditLog).set({ userId: null }).where(eq(auditLog.userId, userId));
      await tx.insert(auditLog).values({ userId: null, action: "user.deleted" });
      await tx.delete(users).where(eq(users.id, userId));
    });
    // Zusagen sind per Kaskade weg: freie Plaetze aus Wartelisten fuellen (sonst spaetestens der 10-Minuten-Job)
    await this.events.fillAllWaitlists().catch(() => undefined);
  }

  /** Job: gesperrte Konten (deleted_at aelter als `olderThanMs`), die noch existieren, fertig loeschen. */
  async erasePending(olderThanMs = ERASE_GRACE_MS): Promise<number> {
    const pending = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, new Date(Date.now() - olderThanMs))))
      .limit(100);
    let done = 0;
    for (const { id } of pending) {
      try {
        await this.eraseEverything(id);
        done++;
      } catch {
        this.log.error("Kontoloeschung weiterhin unvollstaendig, naechster Versuch beim naechsten Lauf.");
      }
    }
    return done;
  }
}
