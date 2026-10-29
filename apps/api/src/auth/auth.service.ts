import { createHash, randomBytes } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  LEGAL_VERSION,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
} from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { auditLog, consents, sessions, users } from "../db/schema";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// OWASP-Empfehlung fuer argon2id: m=19 MiB, t=2, p=1 (Algorithm 2 = argon2id)
const ARGON_OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

@Injectable()
export class AuthService {
  // Wird bei unbekannter E-Mail verifiziert, damit Antwortzeit nicht verraet, ob ein Konto existiert.
  private dummyHash: Promise<string> = hash("dummy-password-for-timing", ARGON_OPTIONS);

  constructor(@Inject(DB) private readonly db: Database) {}

  async register(input: RegisterInput): Promise<PublicUser> {
    const passwordHash = await hash(input.password, ARGON_OPTIONS);
    try {
      const user = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({
            email: input.email,
            passwordHash,
            displayName: input.displayName,
          })
          .returning();
        await tx.insert(consents).values(
          (["terms", "privacy"] as const).map((purpose) => ({
            userId: created.id,
            purpose,
            granted: true,
            version: LEGAL_VERSION,
          })),
        );
        await tx.insert(auditLog).values({ userId: created.id, action: "user.registered" });
        return created;
      });
      return this.toPublic(user);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException("Diese E-Mail-Adresse ist bereits registriert.");
      }
      throw err;
    }
  }

  async login(input: LoginInput): Promise<{ user: PublicUser; token: string }> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, input.email), isNull(users.deletedAt)))
      .limit(1);

    const valid = await verify(user?.passwordHash ?? (await this.dummyHash), input.password);
    if (!user || !valid) {
      throw new UnauthorizedException("E-Mail oder Passwort ist falsch.");
    }

    const token = randomBytes(32).toString("base64url");
    await this.db.insert(sessions).values({
      tokenHash: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    await this.db.insert(auditLog).values({ userId: user.id, action: "user.login" });
    return { user: this.toPublic(user), token };
  }

  /** Prueft das Passwort eines bereits eingeloggten Nutzers (fuer sensible Aktionen). */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return verify(user?.passwordHash ?? (await this.dummyHash), password);
  }

  async logout(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  }

  async userForToken(token: string): Promise<PublicUser | null> {
    const [row] = await this.db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, sha256(token)),
          gt(sessions.expiresAt, new Date()),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    return row ? this.toPublic(row.user) : null;
  }

  private toPublic(user: typeof users.$inferSelect): PublicUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
