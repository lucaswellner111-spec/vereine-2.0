import { Logger } from "@nestjs/common";
import type { Cache } from "../cache/cache.module";

/** Oeffentliche Vereinsseiten werden 60 s zwischengespeichert (Redis bzw. Prozess-Cache). */
export const PUBLIC_CACHE_TTL = 60;
export const publicOrgKey = (slug: string) => `pub:org:${slug}`;
/** Versionszaehler fuer alle Listen (Finder): Erhoehen macht alle `pub:list:*`-Eintraege sofort ungueltig. */
export const PUBLIC_LIST_VERSION = "pub:ver";

const log = new Logger("PublicCache");

/**
 * Nach Aenderungen, die die oeffentliche Seite betreffen (Freischalten, Vereinsdaten, Beitrag ausgeblendet ...),
 * Cache sofort leeren - Abschalten soll nicht erst nach 60 s wirken. Wirft nie (Cache-Ausfall = Eintrag laeuft ab).
 */
export async function invalidatePublicOrg(cache: Cache, slug: string | null | undefined, lists = false): Promise<void> {
  try {
    if (slug) await cache.del(publicOrgKey(slug));
    if (lists) await cache.incr(PUBLIC_LIST_VERSION, 7 * 86400);
  } catch {
    log.warn("Oeffentlicher Cache konnte nicht geleert werden (laeuft nach 60 s ab).");
  }
}
