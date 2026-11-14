import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import type { TwoFactorPolicy } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { users } from "../db/schema";
import { TwoFactorService } from "./two-factor.service";

/** Uebergangsfrist in Tagen ab dem Moment, ab dem die Pflicht fuer eine Person gilt (Plattform-Admins: sofort). */
export const TWO_FACTOR_GRACE_DAYS = { orgAdmin: 14, platform: 0 } as const;

/**
 * Pflicht an/aus: `TWOFACTOR_ENFORCE=true|false` entscheidet; ohne Angabe gilt sie nur in Produktion
 * (Tests und lokale Entwicklung laufen ohne Zwang). Wird bei jedem Aufruf gelesen (Tests koennen sie umschalten).
 */
export function twoFactorEnforced(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.TWOFACTOR_ENFORCE?.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return env.NODE_ENV === "production";
}

const DAY_MS = 24 * 3600_000;
const NONE: TwoFactorPolicy = { required: false, enabled: false, reason: null, deadline: null, blocked: false };

/**
 * Zwei-Faktor-Pflicht fuer Vorstaende (Rolle admin eines Vereins) und Plattform-Admins. Der Beginn der Uebergangsfrist
 * wird beim ersten Pruefen je Person festgehalten (`users.two_factor_required_since`). Nach Fristende sind die
 * sensiblen Aktionen (Mitgliederdaten, Rechnungen, Einladungen, Moderation) gesperrt, bis TOTP aktiv ist.
 * Wer Vorstand ist, weiss nur der Aufrufer (Bereich social): er uebergibt `orgAdmin`.
 */
@Injectable()
export class TwoFactorPolicyService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(TwoFactorService) private readonly twoFactor: TwoFactorService,
  ) {}

  async evaluate(userId: string, who: { platformAdmin: boolean; orgAdmin: boolean }, now = new Date()): Promise<TwoFactorPolicy> {
    if (!twoFactorEnforced() || (!who.platformAdmin && !who.orgAdmin)) return NONE;
    const reason = who.platformAdmin ? "platform" : "org-admin";
    if (await this.twoFactor.isEnabled(userId)) return { required: true, enabled: true, reason, deadline: null, blocked: false };

    const since = await this.markRequired(userId, now);
    const graceDays = who.platformAdmin ? TWO_FACTOR_GRACE_DAYS.platform : TWO_FACTOR_GRACE_DAYS.orgAdmin;
    const deadline = new Date(since.getTime() + graceDays * DAY_MS);
    return { required: true, enabled: false, reason, deadline: deadline.toISOString(), blocked: now.getTime() >= deadline.getTime() };
  }

  /** Haelt den Beginn der Frist fest (nur beim ersten Mal) und liefert ihn. */
  private async markRequired(userId: string, now: Date): Promise<Date> {
    await this.db.update(users).set({ twoFactorRequiredSince: now }).where(and(eq(users.id, userId), isNull(users.twoFactorRequiredSince)));
    const [row] = await this.db.select({ at: users.twoFactorRequiredSince }).from(users).where(eq(users.id, userId)).limit(1);
    return row?.at ?? now;
  }
}
