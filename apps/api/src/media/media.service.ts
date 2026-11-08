import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import sharp, { type Metadata } from "sharp";
import type { MediaRef, PublicUser } from "@vereine/shared";
import { CACHE, type Cache } from "../cache/cache.module";
import { enforceLimit } from "../common/rate-limit";
import { DB, type Database } from "../db/db.module";
import { OrgEvents } from "../orgs/org-events";
import { OrgsService } from "../orgs/orgs.service";
import { media, organizations, postMedia, posts, profiles } from "../db/schema";
import { JobsService } from "../jobs/jobs.service";
import { ProfileAccess } from "../profiles/profile-access.service";
import { StorageService } from "./storage.service";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 50_000_000; // Schutz vor Dekompressionsbomben
const MAX_SIDE = 12_000;
const UPLOADS_PER_HOUR = 40;
const ALLOWED = new Set(["jpeg", "png", "webp"]);

type Kind = "avatar" | "post" | "org_logo" | "org_banner";
type Variant = { width: number; height: number; fit: "cover" | "inside" };
const square = (size: number, fit: Variant["fit"]): Variant => ({ width: size, height: size, fit });
const VARIANTS: Record<Kind, Record<string, Variant>> = {
  avatar: { avatar: square(256, "cover"), "avatar-sm": square(64, "cover") },
  post: { thumb: square(480, "cover"), medium: square(1080, "inside") },
  org_logo: { logo: square(256, "cover"), "logo-sm": square(64, "cover") },
  org_banner: { banner: { width: 1500, height: 500, fit: "cover" }, "banner-sm": { width: 750, height: 250, fit: "cover" } },
};
/** Variante, deren Masse in media.width/height landen. */
const MAIN_VARIANT = new Set(["medium", "avatar", "logo", "banner"]);
export type OrgImageKind = "logo" | "banner";

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
    @Inject(OrgEvents) private readonly orgEvents: OrgEvents,
    @Inject(OrgsService) private readonly orgs: OrgsService,
  ) {}

  onModuleInit() {
    this.jobs.define("media.cleanup", async () => void (await this.cleanupOrphans()));
    this.jobs.every("media.cleanup", 60 * 60 * 1000);
    // Verein wird geloescht: Bilder seiner Beitraege entfernen, solange die Verknuepfung noch besteht (in der Transaktion).
    this.orgEvents.onOrgDeleting((orgId, tx) => this.removeForOrg(orgId, tx));
  }

  /** Zeilen in der Loesch-Transaktion entfernen (Beitragsbilder, Logo, Banner); Dateien erst nach dem Commit (Rueckgabe). */
  private async removeForOrg(orgId: string, tx: Database): Promise<(() => Promise<void>) | void> {
    const [rows, own] = await Promise.all([
      tx
        .select({ id: postMedia.mediaId })
        .from(postMedia)
        .innerJoin(posts, eq(posts.id, postMedia.postId))
        .where(eq(posts.orgId, orgId)),
      tx.select({ id: media.id }).from(media).where(eq(media.orgId, orgId)),
    ]);
    const ids = [...new Set([...rows, ...own].map((r) => r.id))];
    if (ids.length === 0) return;
    await tx.delete(media).where(inArray(media.id, ids));
    return async () => {
      for (const id of ids) await this.storage.remove(id);
    };
  }

  // --- Hochladen ------------------------------------------------------------------

  async uploadPostImage(user: PublicUser, data: Buffer): Promise<MediaRef> {
    await this.rateLimit(user.id);
    return this.store({ ownerId: user.id }, "post", data);
  }

  async setAvatar(user: PublicUser, data: Buffer): Promise<MediaRef> {
    await this.rateLimit(user.id);
    const profile = await this.access.ensure(user.id);
    if (!profile) throw new NotFoundException("Profil nicht gefunden.");
    const ref = await this.store({ ownerId: user.id }, "avatar", data);
    await this.db.update(profiles).set({ avatarMediaId: ref.id, updatedAt: new Date() }).where(eq(profiles.userId, user.id));
    if (profile.avatarMediaId) await this.deleteMedia([profile.avatarMediaId]);
    return ref;
  }

  /** Vereinslogo/-banner setzen (nur Vorstand). Gehoert dem Verein (owner_id NULL), das alte Bild wird geloescht. */
  async setOrgImage(user: PublicUser, slug: string, kind: OrgImageKind, data: Buffer): Promise<MediaRef> {
    const org = await this.requireOrgAdmin(user, slug);
    await this.rateLimit(user.id);
    const ref = await this.store({ orgId: org.id }, kind === "logo" ? "org_logo" : "org_banner", data);
    let old: string | null;
    try {
      // Atomar: alten Verweis unter Zeilensperre lesen und ersetzen (parallele Uploads verlieren kein Bild)
      old = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .select({ logo: organizations.logoMediaId, banner: organizations.bannerMediaId })
          .from(organizations)
          .where(eq(organizations.id, org.id))
          .for("update");
        if (!row) throw new NotFoundException("Verein nicht gefunden.");
        await tx
          .update(organizations)
          .set(kind === "logo" ? { logoMediaId: ref.id } : { bannerMediaId: ref.id })
          .where(eq(organizations.id, org.id));
        return kind === "logo" ? row.logo : row.banner;
      });
    } catch (err) {
      await this.deleteMedia([ref.id]); // frisch gespeichertes Bild nicht verwaisen lassen
      throw err;
    }
    if (old && old !== ref.id) await this.deleteMedia([old]);
    return ref;
  }

  async removeOrgImage(user: PublicUser, slug: string, kind: OrgImageKind): Promise<void> {
    const org = await this.requireOrgAdmin(user, slug);
    const old = kind === "logo" ? org.logoMediaId : org.bannerMediaId;
    if (!old) return;
    await this.db
      .update(organizations)
      .set(kind === "logo" ? { logoMediaId: null } : { bannerMediaId: null })
      .where(eq(organizations.id, org.id));
    await this.deleteMedia([old]);
  }

  private async requireOrgAdmin(user: PublicUser, slug: string) {
    const org = await this.orgs.requireBySlug(slug);
    if ((await this.orgs.activeRole(org.id, user.id)) !== "admin") throw new ForbiddenException("Nur der Vorstand ändert Logo und Banner.");
    return org;
  }

  async removeAvatar(user: PublicUser): Promise<void> {
    const profile = await this.access.ensure(user.id);
    if (!profile?.avatarMediaId) return;
    await this.db.update(profiles).set({ avatarMediaId: null, updatedAt: new Date() }).where(eq(profiles.userId, user.id));
    await this.deleteMedia([profile.avatarMediaId]);
  }

  private async rateLimit(userId: string) {
    await enforceLimit(this.cache, `media:up:${userId}`, UPLOADS_PER_HOUR, 3600, "Zu viele Uploads. Bitte warte etwas."); // fail open
  }

  /** owner: Nutzerbild (ownerId) oder Vereinsbild (orgId). */
  private async store(owner: { ownerId?: string; orgId?: string }, kind: Kind, data: Buffer): Promise<MediaRef> {
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
          .resize(v.width, v.height, { fit: v.fit, withoutEnlargement: v.fit === "inside" })
          .webp({ quality: 80 })
          .toBuffer({ resolveWithObject: true });
        await this.storage.put(`${id}/${name}.webp`, out.data);
        bytes += out.data.length;
        if (MAIN_VARIANT.has(name)) {
          width = out.info.width;
          height = out.info.height;
        }
      }
    } catch (err) {
      await this.storage.remove(id);
      throw new BadRequestException("Das Bild konnte nicht verarbeitet werden.");
    }
    await this.db.insert(media).values({ id, ownerId: owner.ownerId ?? null, orgId: owner.orgId ?? null, kind, width, height, bytes });
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

  /** Avatare und Vereinsbilder (org_logo/org_banner) sehen alle Angemeldeten; Beitragsbilder nach Beitragsregel. */
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

  /** Kontoloeschung: alle Dateien des Nutzers entfernen (Zeilen folgen per Kaskade). Vereinsbilder (owner_id NULL) bleiben. */
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
