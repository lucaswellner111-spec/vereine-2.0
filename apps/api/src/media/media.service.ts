import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import sharp, { type Metadata } from "sharp";
import type { MediaRef, PublicUser } from "@vereine/shared";
import { CACHE, type Cache } from "../cache/cache.module";
import { DB, type Database } from "../db/db.module";
import { media, postMedia, posts, profiles } from "../db/schema";
import { JobsService } from "../jobs/jobs.service";
import { ProfileAccess } from "../profiles/profile-access.service";
import { StorageService } from "./storage.service";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 50_000_000; // Schutz vor Dekompressionsbomben
const MAX_SIDE = 12_000;
const UPLOADS_PER_HOUR = 40;
const ALLOWED = new Set(["jpeg", "png", "webp"]);

type Kind = "avatar" | "post";
const VARIANTS: Record<Kind, Record<string, { size: number; fit: "cover" | "inside" }>> = {
  avatar: { avatar: { size: 256, fit: "cover" }, "avatar-sm": { size: 64, fit: "cover" } },
  post: { thumb: { size: 480, fit: "cover" }, medium: { size: 1080, fit: "inside" } },
};

/**
 * Bilder: Typ wird am Inhalt erkannt (nicht am Dateinamen/Header), EXIF/Metadaten (z. B. GPS) werden entfernt,
 * Bilder werden neu kodiert (WebP) - dadurch bleiben keine eingebetteten Nutzlasten uebrig. Das Original wird
 * NICHT gespeichert (Datenminimierung). SKALIERUNG: Verarbeitung laeuft im API-Prozess; ab hohem Aufkommen in einen
 * Worker-Job auslagern (sharp ist CPU-lastig).
 */
@Injectable()
export class MediaService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(CACHE) private readonly cache: Cache,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(ProfileAccess) private readonly access: ProfileAccess,
  ) {}

  onModuleInit() {
    this.jobs.define("media.cleanup", async () => void (await this.cleanupOrphans()));
    this.jobs.every("media.cleanup", 60 * 60 * 1000);
  }

  // --- Hochladen ------------------------------------------------------------------

  async uploadPostImage(user: PublicUser, data: Buffer): Promise<MediaRef> {
    await this.rateLimit(user.id);
    return this.store(user.id, "post", data);
  }

  async setAvatar(user: PublicUser, data: Buffer): Promise<MediaRef> {
    await this.rateLimit(user.id);
    const profile = await this.access.ensure(user.id);
    if (!profile) throw new NotFoundException("Profil nicht gefunden.");
    const ref = await this.store(user.id, "avatar", data);
    await this.db.update(profiles).set({ avatarMediaId: ref.id, updatedAt: new Date() }).where(eq(profiles.userId, user.id));
    if (profile.avatarMediaId) await this.deleteMedia([profile.avatarMediaId]);
    return ref;
  }

  async removeAvatar(user: PublicUser): Promise<void> {
    const profile = await this.access.ensure(user.id);
    if (!profile?.avatarMediaId) return;
    await this.db.update(profiles).set({ avatarMediaId: null, updatedAt: new Date() }).where(eq(profiles.userId, user.id));
    await this.deleteMedia([profile.avatarMediaId]);
  }

  private async rateLimit(userId: string) {
    if ((await this.cache.incr(`media:up:${userId}`, 3600)) > UPLOADS_PER_HOUR) {
      throw new HttpException({ message: "Zu viele Uploads. Bitte warte etwas.", statusCode: 429 }, 429);
    }
  }

  private async store(ownerId: string, kind: Kind, data: Buffer): Promise<MediaRef> {
    if (data.length === 0 || data.length > MAX_UPLOAD_BYTES) throw new BadRequestException("Bild ist leer oder groesser als 8 MB.");
    let meta: Metadata;
    try {
      meta = await sharp(data, { limitInputPixels: MAX_PIXELS }).metadata();
    } catch {
      throw new BadRequestException("Das ist kein gueltiges Bild.");
    }
    if (!meta.format || !ALLOWED.has(meta.format) || !meta.width || !meta.height) {
      throw new BadRequestException("Erlaubt sind JPEG, PNG und WebP.");
    }
    if (meta.width > MAX_SIDE || meta.height > MAX_SIDE) throw new BadRequestException("Das Bild ist zu gross (max. 12.000 Pixel).");

    const id = crypto.randomUUID();
    let width = 0;
    let height = 0;
    let bytes = 0;
    try {
      for (const [name, v] of Object.entries(VARIANTS[kind])) {
        const out = await sharp(data, { limitInputPixels: MAX_PIXELS })
          .rotate() // EXIF-Ausrichtung anwenden; Metadaten werden beim Neukodieren verworfen
          .resize(v.size, v.size, { fit: v.fit, withoutEnlargement: v.fit === "inside" })
          .webp({ quality: 80 })
          .toBuffer({ resolveWithObject: true });
        await this.storage.put(`${id}/${name}.webp`, out.data);
        bytes += out.data.length;
        if (name === "medium" || name === "avatar") {
          width = out.info.width;
          height = out.info.height;
        }
      }
    } catch (err) {
      await this.storage.remove(id);
      throw new BadRequestException("Das Bild konnte nicht verarbeitet werden.");
    }
    await this.db.insert(media).values({ id, ownerId, kind, width, height, bytes });
    return { id, width, height };
  }

  // --- Beitraege ---------------------------------------------------------------------

  /** Haengt hochgeladene Bilder an einen neuen Beitrag (nur eigene, noch nicht verwendete). */
  async attach(userId: string, postId: string, mediaIds: string[]): Promise<void> {
    if (mediaIds.length === 0) return;
    const unique = [...new Set(mediaIds)];
    const rows = await this.db
      .select({ id: media.id })
      .from(media)
      .leftJoin(postMedia, eq(postMedia.mediaId, media.id))
      .where(and(inArray(media.id, unique), eq(media.ownerId, userId), eq(media.kind, "post"), isNull(postMedia.postId)));
    if (rows.length !== unique.length) throw new BadRequestException("Ein Bild gehoert nicht dir oder wird schon verwendet.");
    await this.db.insert(postMedia).values(unique.map((mediaId, position) => ({ postId, mediaId, position })));
  }

  async forPosts(postIds: string[]): Promise<Map<string, MediaRef[]>> {
    const out = new Map<string, MediaRef[]>();
    if (postIds.length === 0) return out;
    const rows = await this.db
      .select({ postId: postMedia.postId, id: media.id, width: media.width, height: media.height, position: postMedia.position })
      .from(postMedia)
      .innerJoin(media, eq(media.id, postMedia.mediaId))
      .where(inArray(postMedia.postId, postIds))
      .orderBy(postMedia.position);
    for (const r of rows) out.set(r.postId, [...(out.get(r.postId) ?? []), { id: r.id, width: r.width, height: r.height }]);
    return out;
  }

  async deleteForPost(postId: string): Promise<void> {
    const rows = await this.db.select({ id: postMedia.mediaId }).from(postMedia).where(eq(postMedia.postId, postId));
    await this.deleteMedia(rows.map((r) => r.id));
  }

  // --- Ausliefern -------------------------------------------------------------------------

  async serve(user: PublicUser, id: string, variant: string): Promise<Buffer> {
    const [m] = await this.db.select().from(media).where(eq(media.id, id)).limit(1);
    if (!m || !(variant in VARIANTS[m.kind as Kind])) throw new NotFoundException("Bild nicht gefunden.");
    if (m.kind === "post" && m.ownerId !== user.id) {
      // Beitragsbild: sichtbar, wenn der Beitrag sichtbar ist (Vereinsbeitraege oeffentlich, persoenliche nach Profilregel)
      const [post] = await this.db
        .select({ authorId: posts.authorId, orgId: posts.orgId })
        .from(postMedia)
        .innerJoin(posts, eq(posts.id, postMedia.postId))
        .where(and(eq(postMedia.mediaId, id), isNull(posts.deletedAt), isNull(posts.hiddenAt)))
        .limit(1);
      if (!post) throw new NotFoundException("Bild nicht gefunden."); // nicht verknuepfte Entwuerfe sind privat
      if (!post.orgId && !(await this.access.canView(user.id, post.authorId))) throw new ForbiddenException("Kein Zugriff.");
    }
    const data = await this.storage.get(`${id}/${variant}.webp`);
    if (!data) throw new NotFoundException("Bild nicht gefunden.");
    return data;
  }

  // --- Loeschen / Aufraeumen -----------------------------------------------------------------

  async deleteMedia(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) await this.storage.remove(id);
    await this.db.delete(media).where(inArray(media.id, ids));
  }

  /** Nicht verwendete Uploads (Entwuerfe, abgebrochene Beitraege) nach 24 h entfernen. */
  async cleanupOrphans(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 3600_000);
    const rows = await this.db
      .select({ id: media.id })
      .from(media)
      .leftJoin(postMedia, eq(postMedia.mediaId, media.id))
      .where(and(eq(media.kind, "post"), lt(media.createdAt, cutoff), isNull(postMedia.postId)));
    await this.deleteMedia(rows.map((r) => r.id));
    return rows.length;
  }

  /** Kontoloeschung: alle Dateien des Nutzers entfernen (Zeilen folgen per Kaskade). */
  async eraseUser(userId: string): Promise<void> {
    const rows = await this.db.select({ id: media.id }).from(media).where(eq(media.ownerId, userId));
    for (const r of rows) await this.storage.remove(r.id);
  }

  async countFor(userId: string): Promise<{ count: number; bytes: number }> {
    const [r] = await this.db
      .select({ count: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${media.bytes}), 0)::int` })
      .from(media)
      .where(eq(media.ownerId, userId));
    return r;
  }
}
