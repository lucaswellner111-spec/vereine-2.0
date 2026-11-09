import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { hash } from "@node-rs/argon2";
import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { LEGAL_VERSION, type ConfirmEmailResult, type PublicUser, type RegisterInput } from "@vereine/shared";
import { appLink } from "../common/app-url";
import { isUniqueViolation } from "../common/pg-errors";
import { DB, type Database } from "../db/db.module";
import { auditLog, authTokens, consents, users } from "../db/schema";
import { MailLimits } from "../mail/mail-limits";
import { MailService } from "../mail/mail.service";
import { maskEmail } from "../mail/mail.templates";
import { ARGON_OPTIONS, AuthService } from "./auth.service";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;
export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;

type Purpose = "verify" | "reset" | "email_change";
const INVALID_LINK = "Der Link ist ungültig oder abgelaufen.";

/**
 * E-Mail-Ablaeufe des Bereichs identity: Registrierung ohne Konto-Enumeration, E-Mail bestaetigen, Passwort vergessen,
 * E-Mail-Adresse aendern. Tokens: 256 Bit Zufall, gespeichert nur als SHA-256-Hash, einmalig, nur der neueste je Zweck gilt.
 * Links tragen den Token im Fragment (#t=…), damit er nicht in Server-/Proxy-Logs und Referern landet.
 *
 * Registrierung: Die Antwort ist immer gleich ("Prüfe dein Postfach"), es wird nie direkt eingeloggt. Neue Adresse:
 * Konto im Zustand `pending_verification` + Bestaetigungslink (der Link meldet an). Vorhandene Adresse: Hinweis-Mail an
 * diese Adresse. Vor der Bestaetigung scheitert die Anmeldung mit derselben Meldung wie ein falsches Passwort -
 * sonst liesse sich per "registrieren, dann anmelden" pruefen, ob eine Adresse schon ein Konto hat.
 */
@Injectable()
export class EmailFlowsService {
  private readonly log = new Logger("EmailFlows");

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(MailLimits) private readonly limits: MailLimits,
  ) {}

  /** Neuen Link ausstellen; offene Links desselben Zwecks werden ungueltig (nur der neueste zaehlt). */
  private async issue(userId: string, purpose: Purpose, ttlMs: number, opts: { newEmail?: string } = {}): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await this.db.transaction(async (tx) => {
      await tx.delete(authTokens).where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
      await tx.insert(authTokens).values({ tokenHash: sha256(token), userId, purpose, newEmail: opts.newEmail ?? null, expiresAt: new Date(Date.now() + ttlMs) });
    });
    return token;
  }

  /** Token einloesen (atomar: gleichzeitige Aufrufe koennen ihn nur einmal nutzen). */
  private async consume(token: string, purposes: Purpose[]) {
    const [row] = await this.db
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokens.tokenHash, sha256(token)), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date()), inArray(authTokens.purpose, purposes)))
      .returning();
    return row ?? null;
  }

  private async sendVerify(email: string, name: string, token: string, actorId?: string) {
    await this.mail.send(email, "verify-email", { name, link: appLink(`/email-bestaetigen#t=${token}`) }, actorId ? { actorId } : {});
  }

  // --- Registrierung --------------------------------------------------------------------------

  async register(input: RegisterInput, ip?: string): Promise<void> {
    await this.limits.enforceAuthIp(ip);
    const mailAllowed = await this.limits.authAddressAllowed(input.email);
    // Immer hashen (auch bei vorhandener Adresse): gleiche Antwortzeit in allen Faellen.
    const passwordHash = await hash(input.password, ARGON_OPTIONS);
    const [existing] = await this.db.select().from(users).where(eq(users.email, input.email)).limit(1);

    if (!existing) {
      let created: typeof users.$inferSelect | null = null;
      try {
        created = await this.db.transaction(async (tx) => {
          const [row] = await tx.insert(users).values({ email: input.email, passwordHash, displayName: input.displayName, pendingVerification: true }).returning();
          await tx.insert(consents).values((["terms", "privacy"] as const).map((purpose) => ({ userId: row.id, purpose, granted: true, version: LEGAL_VERSION })));
          await tx.insert(auditLog).values({ userId: row.id, action: "user.registered" });
          return row;
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err; // gleichzeitige Registrierung derselben Adresse: wie "vorhanden"
      }
      if (created) {
        const token = await this.issue(created.id, "verify", VERIFY_TTL_MS);
        if (mailAllowed) await this.sendVerify(created.email, created.displayName, token);
        return;
      }
      return this.register(input, undefined);
    }

    if (existing.deletedAt) return; // Konto in Loeschung: nichts tun, Antwort bleibt gleich
    if (existing.pendingVerification) {
      // Nie bestaetigt: Das hier eingegebene Passwort wird NIRGENDS gespeichert und das Konto nicht veraendert; der
      // urspruengliche Bestaetigungslink bleibt gueltig. Stattdessen geht ein Link "Passwort festlegen" (Reset-Token,
      // 1 h) an die Adresse: Wer ihn einloest, legt das Passwort selbst fest und bestaetigt damit die Adresse. So kann
      // niemand, der dieselbe Adresse spaeter registriert, der echten Person ein eigenes Passwort unterschieben - egal
      // welchen Link sie oeffnet. Kein Name in der Mail (er stammt von irgendeiner Registrierung).
      await this.db.insert(auditLog).values({ userId: existing.id, action: "user.registration.repeated" });
      if (mailAllowed) {
        const token = await this.issue(existing.id, "reset", RESET_TTL_MS);
        await this.mail.send(existing.email, "registration-complete", { link: appLink(`/passwort-neu#t=${token}`), validMinutes: RESET_TTL_MS / 60_000 });
      }
      return;
    }
    if (mailAllowed) {
      await this.mail.send(existing.email, "account-exists", { name: existing.displayName, link: appLink("/login"), resetLink: appLink("/passwort-vergessen") });
    }
  }

  // --- E-Mail bestaetigen ---------------------------------------------------------------------

  /** Erneut senden (angemeldet, Adresse noch unbestaetigt, z. B. Konten von vor der Bestaetigungspflicht). */
  async resend(user: PublicUser, ip?: string): Promise<void> {
    if (user.emailVerified) return;
    await this.limits.enforceAuthIp(ip);
    if (!(await this.limits.authAddressAllowed(user.email))) return;
    const token = await this.issue(user.id, "verify", VERIFY_TTL_MS);
    await this.sendVerify(user.email, user.displayName, token, user.id);
  }

  /**
   * Link aus der Mail einloesen (Bestaetigung oder E-Mail-Wechsel). Bei einer frischen Registrierung (noch nie
   * angemeldet) meldet der Link direkt an, sofern in diesem Browser niemand angemeldet ist.
   */
  async confirm(token: string, currentSession: string | undefined, userAgent?: string): Promise<ConfirmEmailResult & { sessionToken?: string }> {
    const row = await this.consume(token, ["verify", "email_change"]);
    if (!row) throw new BadRequestException(INVALID_LINK);
    const [user] = await this.db.select().from(users).where(and(eq(users.id, row.userId), isNull(users.deletedAt))).limit(1);
    if (!user) throw new BadRequestException(INVALID_LINK);

    let changed = false;
    let registered = false; // dieser Link hat die Registrierung abgeschlossen
    if (row.purpose === "email_change" && row.newEmail) {
      try {
        await this.db.update(users).set({ email: row.newEmail, emailVerifiedAt: new Date(), pendingVerification: false }).where(eq(users.id, user.id));
      } catch (err) {
        if (isUniqueViolation(err)) throw new BadRequestException("Diese E-Mail-Adresse kann nicht übernommen werden.");
        throw err;
      }
      await this.db.delete(authTokens).where(and(eq(authTokens.userId, user.id), inArray(authTokens.purpose, ["verify", "email_change"]), isNull(authTokens.usedAt)));
      await this.db.insert(auditLog).values({ userId: user.id, action: "user.email.changed" });
      changed = true;
    } else {
      // Bedingung `pending_verification = true` im UPDATE: Nur wer die Registrierung wirklich abschliesst, wird
      // angemeldet (bei gleichzeitig geoeffneten Links gewinnt genau einer).
      const won = await this.db
        .update(users)
        .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`, pendingVerification: false })
        .where(and(eq(users.id, user.id), eq(users.pendingVerification, true)))
        .returning({ id: users.id });
      registered = won.length > 0;
      if (!registered) {
        await this.db.update(users).set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` }).where(eq(users.id, user.id));
      }
      await this.db.insert(auditLog).values({ userId: user.id, action: "user.email.verified" });
    }
    await this.auth.invalidateUserSessions(user.id); // zwischengespeicherte Sitzungen enthalten Adresse/Status

    const [fresh] = await this.db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const someoneLoggedIn = currentSession ? !!(await this.auth.userForToken(currentSession)) : false;
    if (row.purpose === "verify" && registered && !someoneLoggedIn) {
      const { user: pub, token: sessionToken } = await this.auth.startSession(fresh, userAgent);
      return { user: pub, loggedIn: true, changed, sessionToken };
    }
    return { user: this.auth.toPublic(fresh), loggedIn: false, changed };
  }

  // --- Passwort vergessen ---------------------------------------------------------------------

  async forgotPassword(email: string, ip?: string): Promise<void> {
    await this.limits.enforceAuthIp(ip);
    const allowed = await this.limits.authAddressAllowed(email);
    const [user] = await this.db.select().from(users).where(and(eq(users.email, email), isNull(users.deletedAt))).limit(1);
    if (!user || !allowed) return;
    const token = await this.issue(user.id, "reset", RESET_TTL_MS);
    await this.mail.send(user.email, "password-reset", { name: user.displayName, link: appLink(`/passwort-neu#t=${token}`), validMinutes: RESET_TTL_MS / 60_000 });
  }

  /** Neues Passwort per Link (1 h, einmalig). Danach sind alle Sitzungen beendet; die Adresse gilt als bestaetigt. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const row = await this.consume(token, ["reset"]);
    if (!row) throw new BadRequestException(INVALID_LINK);
    const passwordHash = await hash(newPassword, ARGON_OPTIONS);
    const updated = await this.db
      .update(users)
      .set({ passwordHash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`, pendingVerification: false })
      .where(and(eq(users.id, row.userId), isNull(users.deletedAt)))
      .returning({ id: users.id });
    if (!updated.length) throw new BadRequestException(INVALID_LINK);
    await this.auth.endAllSessions(row.userId);
    // Uebrige Reset-Links und offene Bestaetigungslinks entwerten (die Adresse ist jetzt bestaetigt).
    await this.db
      .delete(authTokens)
      .where(and(eq(authTokens.userId, row.userId), inArray(authTokens.purpose, ["reset", "verify"]), ne(authTokens.tokenHash, row.tokenHash), isNull(authTokens.usedAt)));
    await this.db.insert(auditLog).values({ userId: row.userId, action: "user.password.reset" });
  }

  // --- E-Mail-Adresse aendern -----------------------------------------------------------------

  /**
   * Bestaetigung an die neue Adresse, Hinweis an die bisherige. Ist die neue Adresse schon vergeben, passiert nichts
   * weiter (gleiche Antwort, keine Enumeration ueber diesen Weg).
   */
  async requestEmailChange(user: PublicUser, newEmail: string, password: string, ip?: string): Promise<void> {
    await this.limits.enforceAuthIp(ip); // vor der Passwortpruefung: bremst auch das Durchprobieren von Passwoertern
    if (!(await this.auth.verifyPassword(user.id, password))) throw new UnauthorizedException("Das Passwort ist falsch.");
    if (newEmail === user.email) throw new BadRequestException("Das ist bereits deine E-Mail-Adresse.");
    const allowed = await this.limits.authAddressAllowed(newEmail);
    const [taken] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, newEmail)).limit(1);
    if (!taken && allowed) {
      const token = await this.issue(user.id, "email_change", EMAIL_CHANGE_TTL_MS, { newEmail });
      await this.mail.send(newEmail, "email-change-confirm", { name: user.displayName, link: appLink(`/email-bestaetigen#t=${token}`) }, { actorId: user.id });
    }
    await this.mail.send(user.email, "email-change-notice", { name: user.displayName, newEmailMasked: maskEmail(newEmail), link: appLink("/passwort-vergessen") }, { actorId: user.id });
    await this.db.insert(auditLog).values({ userId: user.id, action: "user.email.change-requested" });
    this.log.log("E-Mail-Wechsel angefordert.");
  }
}
