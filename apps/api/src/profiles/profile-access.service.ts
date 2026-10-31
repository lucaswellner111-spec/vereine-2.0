import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { UsersDirectory } from "../auth/users-directory.service";
import { DB, type Database } from "../db/db.module";
import { profiles, userFollows } from "../db/schema";

export type ProfileRow = typeof profiles.$inferSelect;

const baseHandle = (name: string) =>
  name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 22);

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/**
 * Zugriff auf Profile fuer andere Module (Beitraege, Feed, Medien): Profile werden bei Bedarf automatisch
 * angelegt (Handle aus dem Anzeigenamen), Sichtbarkeitsregeln sind hier an EINER Stelle.
 */
@Injectable()
export class ProfileAccess {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
  ) {}

  /** Liefert Profile fuer alle IDs und legt fehlende an. */
  async ensureMany(userIds: string[]): Promise<Map<string, ProfileRow>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    let rows = await this.db.select().from(profiles).where(inArray(profiles.userId, ids));
    const have = new Set(rows.map((r) => r.userId));
    const missing = ids.filter((id) => !have.has(id));
    if (missing.length) {
      const names = await this.directory.names(missing);
      for (const id of missing) {
        if (!names.has(id)) continue; // Nutzer existiert nicht (mehr)
        await this.create(id, names.get(id)!);
      }
      rows = await this.db.select().from(profiles).where(inArray(profiles.userId, ids));
    }
    return new Map(rows.map((r) => [r.userId, r]));
  }

  async ensure(userId: string): Promise<ProfileRow | undefined> {
    return (await this.ensureMany([userId])).get(userId);
  }

  private async create(userId: string, displayName: string): Promise<void> {
    let base = baseHandle(displayName);
    if (base.length < 3) base = `${base}user`.slice(0, 22);
    for (let i = 0; i < 8; i++) {
      const handle = i === 0 ? base : `${base}${Math.floor(100 + Math.random() * 9000)}`;
      try {
        await this.db.insert(profiles).values({ userId, handle }).onConflictDoNothing({ target: profiles.userId });
        return;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err; // Handle vergeben -> naechster Versuch
      }
    }
    await this.db.insert(profiles).values({ userId, handle: `u${userId.replace(/-/g, "").slice(0, 12)}` }).onConflictDoNothing();
  }

  async byHandle(handle: string): Promise<ProfileRow | undefined> {
    const [row] = await this.db.select().from(profiles).where(eq(profiles.handle, handle.toLowerCase())).limit(1);
    return row;
  }

  /** Ist der Nutzer `ownerId` fuer `viewerId` sichtbar (Beitraege, Listen)? Eigenes Profil, oeffentlich oder bestaetigter Follower. */
  async canView(viewerId: string, ownerId: string): Promise<boolean> {
    if (viewerId === ownerId) return true;
    const profile = await this.ensure(ownerId);
    if (!profile || profile.visibility === "public") return true;
    const [f] = await this.db
      .select()
      .from(userFollows)
      .where(and(eq(userFollows.followerId, viewerId), eq(userFollows.followedId, ownerId), eq(userFollows.status, "active")))
      .limit(1);
    return !!f;
  }

  /** Autoren, deren (persoenliche) Beitraege `viewerId` sehen darf, weil er ihnen folgt. */
  async followedUserIds(viewerId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: userFollows.followedId })
      .from(userFollows)
      .where(and(eq(userFollows.followerId, viewerId), eq(userFollows.status, "active")));
    return rows.map((r) => r.id);
  }
}
