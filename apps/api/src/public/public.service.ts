import { createHash } from "node:crypto";
import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PUBLIC_PAGE_SIZE, type PublicOrg, type PublicOrgQuery, type PublicOrgSummary } from "@vereine/shared";
import { CACHE, type Cache } from "../cache/cache.module";
import { PUBLIC_CACHE_TTL, PUBLIC_LIST_VERSION, publicOrgKey } from "../common/public-cache";
import { EventsService } from "../events/events.service";
import { MediaService } from "../media/media.service";
import { OrgsService } from "../orgs/orgs.service";
import { PostsService } from "../posts/posts.service";

const SLUG = /^[a-z0-9-]{1,80}$/;
const MISSING = "-";

/**
 * Oeffentlicher Bereich ohne Login (Vereinsseite, Vereinsfinder). Liest nur ueber die schmalen Methoden der
 * Fachdienste (keine eigenen Tabellen) und gibt bewusst keine Personendaten heraus: keine Namen, keine Autoren,
 * keine Beitragsbilder, nur oeffentliche Termine. Antworten liegen 60 s im Cache (auch "nicht gefunden").
 * SKALIERUNG: Cache in Redis, geteilt von allen API-Prozessen; Finder-Abfragen sind auf 30 Treffer begrenzt.
 */
@Injectable()
export class PublicService {
  private readonly log = new Logger("PublicService");

  constructor(
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(PostsService) private readonly posts: PostsService,
    @Inject(MediaService) private readonly mediaSvc: MediaService,
    @Inject(CACHE) private readonly cache: Cache,
  ) {}

  async org(slug: string): Promise<PublicOrg> {
    if (!SLUG.test(slug)) throw new NotFoundException("Verein nicht gefunden.");
    const key = publicOrgKey(slug);
    const hit = await this.cached(key);
    if (hit === MISSING) throw new NotFoundException("Verein nicht gefunden.");
    if (hit) return JSON.parse(hit) as PublicOrg;

    const org = await this.orgs.publicBySlug(slug);
    if (!org) {
      await this.store(key, MISSING);
      throw new NotFoundException("Verein nicht gefunden.");
    }
    const [events, posts] = await Promise.all([this.events.publicUpcoming(org.id, 10), this.posts.publicRecent(org.id, 10)]);
    const { id: _id, ...rest } = org;
    const out: PublicOrg = { ...rest, events, posts };
    await this.store(key, JSON.stringify(out));
    return out;
  }

  async list(query: PublicOrgQuery): Promise<PublicOrgSummary[]> {
    const version = (await this.cached(PUBLIC_LIST_VERSION)) ?? "0";
    const hash = createHash("sha256").update(JSON.stringify([query.q ?? "", query.city ?? "", query.tag ?? "", query.category ?? "", query.offset])).digest("hex").slice(0, 32);
    const key = `pub:list:${version}:${hash}`;
    const hit = await this.cached(key);
    if (hit) return JSON.parse(hit) as PublicOrgSummary[];
    const out = await this.orgs.publicList(query, PUBLIC_PAGE_SIZE);
    await this.store(key, JSON.stringify(out));
    return out;
  }

  media(id: string, variant: string): Promise<Buffer> {
    return this.mediaSvc.servePublic(id, variant);
  }

  // Cache-Ausfall: direkt aus der Datenbank (fail open), nie Fehler an Besucher
  private async cached(key: string): Promise<string | null> {
    try {
      return await this.cache.get(key);
    } catch {
      this.log.warn("Cache nicht erreichbar, lese direkt.");
      return null;
    }
  }

  private async store(key: string, value: string): Promise<void> {
    try {
      await this.cache.set(key, value, PUBLIC_CACHE_TTL);
    } catch {
      /* Eintrag fehlt dann nur */
    }
  }
}
