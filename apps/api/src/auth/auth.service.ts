import { createHash, randomBytes } from "node:crypto";
import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import { and, desc, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import {
  type LoginInput,
  type PublicUser,
  type SessionInfo,
} from "@vereine/shared";
import { CACHE, type Cache } from "../cache/cache.module";
import { JobsService } from "../jobs/jobs.service";
import { TwoFactorService } from "./two-factor.service";
import { DB, type Database } from "../db/db.module";
import { auditLog, authTokens, sessions, users } from "../db/schema";
import { ago, RETENTION } from "../common/retention";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sessions werden kurz gecacht: spart eine DB-Abfrage pro Request (SKALIERUNG). */
const SESSION_CACHE_TTL_S = 60;
const sessionKey = (tokenHash: string) => `sess:${tokenHash}`;

/**
 * Brute-Force-Schutz (zusaetzlich zum IP-Limit): 10 Fehlversuche je E-Mail UND IP sperren 15 Minuten - so kann ein
 * Angreifer das Konto nicht fuer alle anderen Geraete sperren. Notbremse: 100 Fehlversuche je E-Mail (alle IPs) sperren
 * 1 Stunde (verteilte Angriffe). Gespeichert werden nur Hashes (keine E-Mail/IP im Klartext in Redis).
 */
const MAX_LOGIN_FAILS = 10;
const LOGIN_FAIL_WINDOW_S = 15 * 60;
const MAX_LOGIN_FAILS_EMAIL = 100;
const LOGIN_FAIL_EMAIL_WINDOW_S = 60 * 60;
const failKeyIp = (email: string, ip: string) => `login:fail:${sha256(`${email}|${ip}`)}`;
const failKeyEmail = (email: string) => `login:fail:${sha256(email)}`;

/** Grobe Beschreibung aus dem User-Agent (ohne Bibliothek, bewusst ungenau). */
export function describeDevice(ua?: string): string {
  if (!ua) return "Unbekanntes Gerät";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unbekanntem System";
  return `${browser} auf ${os}`;
}

// OWASP-Empfehlung fuer argon2id: m=19 MiB, t=2, p=1 (Algorithm 2 = argon2id)
export const ARGON_OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

@Injectable()
export class AuthService implements OnModuleInit {
  // Wird bei unbekannter E-Mail verifiziert, damit Antwortzeit nicht verraet, ob ein Konto existiert.
  private dummyHash: Promise<string> = hash("dummy-password-for-timing", ARGON_OPTIONS);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CACHE) private readonly cache: Cache,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(TwoFactorService) private readonly twoFactor: TwoFactorService,
  ) {}

  onModuleInit() {
    // Abgelaufene Sessions stuendlich entfernen (laeuft im Worker, idempotent).
    this.jobs.define("sessions.purge", async () => void (await this.purgeExpiredSessions()));
    this.jobs.every("sessions.purge", 60 * 60 * 1000);
  }

  /** Loeschfrist Einmal-Links: 7 Tage nach Ablauf (Job privacy.retention). */
  async purgeExpiredTokens(): Promise<number> {
    const removed = await this.db.delete(authTokens).where(lt(authTokens.expiresAt, ago(RETENTION.authTokens))).returning({ h: authTokens.tokenHash });
    return removed.length;
  }

  /** Datenauskunft: Bestaetigungsstatus und offene Einmal-Links (ohne Token-Hashes). */
  async exportEmailInfo(userId: string) {
    const [user] = await this.db.select({ verifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
    const open = await this.db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.userId, userId), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())));
    return {
      emailVerifiedAt: user?.verifiedAt?.toISOString() ?? null,
      pendingEmailChange: open.find((t) => t.purpose === "email_change")?.newEmail ?? null,
      openLinks: open.map((t) => ({ purpose: t.purpose, createdAt: t.createdAt.toISOString(), expiresAt: t.expiresAt.toISOString() })),
    };
  }

  async purgeExpiredSessions(): Promise<number> {
    const removed = await this.db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.tokenHash });
    return removed.length;
  }

  /** Entfernt alle gecachten Sessions eines Nutzers (z. B. vor Kontoloeschung). */
  async invalidateUserSessions(userId: string): Promise<void> {
    const rows = await this.db.select({ tokenHash: sessions.tokenHash }).from(sessions).where(eq(sessions.userId, userId));
    await this.cache.del(...rows.map((r) => sessionKey(r.tokenHash)));
  }

  /**
   * Alle Sitzungen beenden (z. B. Passwort-Reset): erst in der DB loeschen, DANN den Cache leeren - sonst koennte ein
   * paralleler Request die Sitzung zwischen Cache-Leeren und DB-Loeschen erneut cachen (bis zu 60 s gueltig).
   */
  async endAllSessions(userId: string): Promise<void> {
    const removed = await this.db.delete(sessions).where(eq(sessions.userId, userId)).returning({ hash: sessions.tokenHash });
    if (removed.length) await this.cache.del(...removed.map((r) => sessionKey(r.hash))).catch(() => undefined);
  }

  /**
   * Erster Schritt der Kontoloeschung: Konto sperren (deleted_at) und alle Sitzungen in EINER Transaktion beenden,
   * danach die gecachten Sitzungen leeren. Login und Sitzungspruefung beachten deleted_at bereits.
   */
  async beginAccountDeletion(userId: string): Promise<void> {
    const hashes = await this.db.transaction(async (tx) => {
      await tx.update(users).set({ deletedAt: new Date() }).where(and(eq(users.id, userId), isNull(users.deletedAt)));
      const removed = await tx.delete(sessions).where(eq(sessions.userId, userId)).returning({ hash: sessions.tokenHash });
      await tx.insert(auditLog).values({ userId, action: "user.deletion-started" });
      return removed.map((r) => r.hash);
    });
    await this.cache.del(...hashes.map(sessionKey)).catch(() => undefined);
  }

  async login(input: LoginInput, userAgent?: string, ip = "unknown"): Promise<{ user: PublicUser; token: string } | { challenge: string }> {
    // Fehlversuche zaehlen (auch fuer unbekannte Adressen: verraet nicht, ob ein Konto existiert).
    const ipKey = failKeyIp(input.email, ip);
    const emailKey = failKeyEmail(input.email);
    const [fails, emailFails] = await Promise.all([
      this.cache.get(ipKey).catch(() => null),
      this.cache.get(emailKey).catch(() => null),
    ]);
    if (Number(fails ?? 0) >= MAX_LOGIN_FAILS) {
      throw new HttpException({ message: "Zu viele Fehlversuche. Bitte warte 15 Minuten und versuche es erneut.", statusCode: 429 }, 429);
    }
    if (Number(emailFails ?? 0) >= MAX_LOGIN_FAILS_EMAIL) {
      throw new HttpException({ message: "Zu viele Fehlversuche für dieses Konto. Bitte versuche es in einer Stunde erneut.", statusCode: 429 }, 429);
    }
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, input.email), isNull(users.deletedAt)))
      .limit(1);

    const valid = await verify(user?.passwordHash ?? (await this.dummyHash), input.password);
    // Nie bestaetigte Registrierung: dieselbe Antwort wie bei falschem Passwort (siehe EmailFlowsService).
    if (!user || !valid || user.pendingVerification) {
      await this.cache.incr(ipKey, LOGIN_FAIL_WINDOW_S).catch(() => undefined);
      await this.cache.incr(emailKey, LOGIN_FAIL_EMAIL_WINDOW_S).catch(() => undefined);
      throw new UnauthorizedException("E-Mail oder Passwort ist falsch.");
    }
    await this.cache.del(ipKey).catch(() => undefined); // nur diese IP entsperren; die Notbremse laeuft ab

    // Zweiter Faktor aktiv: noch keine Sitzung, nur eine kurzlebige signierte Herausforderung.
    if (await this.twoFactor.isEnabled(user.id)) return { challenge: this.twoFactor.challenge(user.id) };
    return this.startSession(user, userAgent);
  }

  /** Zweiter Schritt der Anmeldung: Herausforderung + Code aus der Authenticator-App oder ein Notfallcode. */
  async completeTwoFactorLogin(challenge: string, code: string, userAgent?: string): Promise<{ user: PublicUser; token: string }> {
    const userId = this.twoFactor.userFromChallenge(challenge);
    if (!(await this.twoFactor.verifyCode(userId, code))) throw new UnauthorizedException("Der Code ist falsch.");
    const [user] = await this.db.select().from(users).where(and(eq(users.id, userId), isNull(users.deletedAt))).limit(1);
    if (!user) throw new UnauthorizedException("Die Anmeldung ist abgelaufen. Bitte melde dich neu an.");
    return this.startSession(user, userAgent);
  }

  async startSession(user: typeof users.$inferSelect, userAgent?: string): Promise<{ user: PublicUser; token: string }> {
    const token = randomBytes(32).toString("base64url");
    await this.db.insert(sessions).values({
      tokenHash: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      device: describeDevice(userAgent),
    });
    await this.db.insert(auditLog).values({ userId: user.id, action: "user.login" });
    return { user: this.toPublic(user), token };
  }

  /** Anzeigename aendern (Bereich identity; das Profil im Bereich social ruft diese Methode auf). */
  async updateDisplayName(userId: string, name: string): Promise<void> {
    await this.db.update(users).set({ displayName: name }).where(eq(users.id, userId));
    await this.invalidateUserSessions(userId); // zwischengespeicherte Sitzungen enthalten den Namen
  }

  // --- Sitzungen und Passwort --------------------------------------------------

  async listSessions(userId: string, currentToken?: string): Promise<SessionInfo[]> {
    const current = currentToken ? sha256(currentToken) : null;
    const rows = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.createdAt))
      .limit(50);
    return rows.map((r) => ({
      id: r.tokenHash.slice(0, 16),
      current: r.tokenHash === current,
      device: r.device ?? "Unbekanntes Gerät",
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    }));
  }

  /** Eine Sitzung beenden (die Kennung ist ein Praefix des Hashes; nur eigene Sitzungen). */
  async revokeSession(userId: string, publicId: string): Promise<boolean> {
    const rows = await this.db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), sql`left(${sessions.tokenHash}, 16) = ${publicId}`))
      .returning({ hash: sessions.tokenHash });
    await this.cache.del(...rows.map((r) => sessionKey(r.hash)));
    return rows.length > 0;
  }

  /** Alle anderen Sitzungen beenden (z. B. nach Passwortaenderung oder bei Verdacht). */
  async revokeOtherSessions(userId: string, currentToken: string): Promise<number> {
    const keep = sha256(currentToken);
    const others = await this.db.select({ hash: sessions.tokenHash }).from(sessions).where(and(eq(sessions.userId, userId), ne(sessions.tokenHash, keep)));
    await this.db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.tokenHash, keep)));
    await this.cache.del(...others.map((o) => sessionKey(o.hash)));
    return others.length;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, currentToken: string): Promise<void> {
    if (!(await this.verifyPassword(userId, currentPassword))) {
      throw new UnauthorizedException("Das aktuelle Passwort ist falsch.");
    }
    if (currentPassword === newPassword) throw new ConflictException("Das neue Passwort muss sich vom alten unterscheiden.");
    await this.db.update(users).set({ passwordHash: await hash(newPassword, ARGON_OPTIONS) }).where(eq(users.id, userId));
    await this.revokeOtherSessions(userId, currentToken); // gestohlene Sitzungen sind damit ungueltig
    await this.db.insert(auditLog).values({ userId, action: "user.password.changed" });
  }

  /** Plattform-Moderation vergeben/entziehen (nur per CLI, nie ueber die Web-Oberflaeche). */
  async setPlatformAdmin(email: string, on: boolean): Promise<boolean> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    if (!user) return false;
    await this.db.update(users).set({ platformRole: on ? "admin" : null }).where(eq(users.id, user.id));
    await this.db.insert(auditLog).values({ userId: user.id, action: on ? "platform.admin.granted" : "platform.admin.revoked" });
    await this.invalidateUserSessions(user.id); // Rolle gilt sofort, nicht erst nach Cache-Ablauf
    return true;
  }

  // --- Zwei-Faktor (Einrichtung in den Einstellungen) ---------------------------------

  twoFactorStatus(userId: string) {
    return this.twoFactor.status(userId);
  }

  twoFactorSetup(user: PublicUser) {
    return this.twoFactor.setup(user.id, user.email);
  }

  twoFactorEnable(userId: string, code: string) {
    return this.twoFactor.enable(userId, code);
  }

  async twoFactorDisable(userId: string, password: string, code: string): Promise<void> {
    if (!(await this.verifyPassword(userId, password))) throw new UnauthorizedException("Das Passwort ist falsch.");
    await this.twoFactor.disable(userId, code);
  }

  async twoFactorRegenerate(userId: string, password: string, code: string): Promise<string[]> {
    if (!(await this.verifyPassword(userId, password))) throw new UnauthorizedException("Das Passwort ist falsch.");
    return this.twoFactor.regenerateRecoveryCodes(userId, code);
  }

  /** Prueft das Passwort eines bereits eingeloggten Nutzers (fuer sensible Aktionen). */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return verify(user?.passwordHash ?? (await this.dummyHash), password);
  }

  async logout(token: string): Promise<void> {
    const tokenHash = sha256(token);
    await this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    await this.cache.del(sessionKey(tokenHash));
  }

  async userForToken(token: string): Promise<PublicUser | null> {
    const tokenHash = sha256(token);
    const cached = await this.cache.get(sessionKey(tokenHash)).catch(() => null);
    if (cached) return JSON.parse(cached) as PublicUser;

    const [row] = await this.db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          gt(sessions.expiresAt, new Date()),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    if (!row) return null;
    const user = this.toPublic(row.user);
    await this.cache.set(sessionKey(tokenHash), JSON.stringify(user), SESSION_CACHE_TTL_S).catch(() => undefined);
    return user;
  }

  toPublic(user: typeof users.$inferSelect): PublicUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
      isPlatformAdmin: user.platformRole === "admin",
      emailVerified: !!user.emailVerifiedAt,
    };
  }
}
