import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import {
  CONSENT_PURPOSES,
  LEGAL_VERSION,
  type ConsentPurpose,
  type ConsentState,
  type PublicUser,
  type SetConsentInput,
} from "@vereine/shared";
import { AuthService } from "../auth/auth.service";
import { DB, type Database } from "../db/db.module";
import { auditLog, consents, sessions, users } from "../db/schema";

@Injectable()
export class PrivacyService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

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
    const [consentHistory, audit, sessionRows] = await Promise.all([
      this.db.select().from(consents).where(eq(consents.userId, user.id)),
      this.db.select().from(auditLog).where(eq(auditLog.userId, user.id)),
      this.db.select().from(sessions).where(eq(sessions.userId, user.id)),
    ]);
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
      activityLog: audit.map((a) => ({
        action: a.action,
        at: a.createdAt.toISOString(),
        meta: a.meta,
      })),
    };
  }

  /** Loeschung (Art. 17): Konto, Sessions und Einwilligungen werden entfernt (FK cascade). */
  async deleteAccount(user: PublicUser, password: string): Promise<void> {
    if (!(await this.auth.verifyPassword(user.id, password))) {
      throw new ForbiddenException("Passwort ist falsch.");
    }
    await this.db.transaction(async (tx) => {
      // Protokoll bleibt ohne Personenbezug (userId wird entkoppelt).
      await tx.update(auditLog).set({ userId: null }).where(eq(auditLog.userId, user.id));
      await tx.insert(auditLog).values({ userId: null, action: "user.deleted" });
      await tx.delete(users).where(eq(users.id, user.id));
    });
  }
}
