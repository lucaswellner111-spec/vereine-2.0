import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

/** Server-Komponenten holen oeffentliche Daten direkt bei der API (im Docker-Netz http://api:4000). */
export const apiInternalUrl = () => process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** Bilder oeffentlicher Vereinsseiten (ohne Login, nur Logo/Banner freigeschalteter Vereine). */
export const publicMediaUrl = (id: string, variant: "logo" | "logo-sm" | "banner" | "banner-sm") => `/api/public/media/${id}/${variant}`;

const IP = /^[0-9a-fA-F.:]{2,45}$/;

/**
 * Besucher-IP weiterreichen, damit das Limit der API (60/min je IP) je Besucher zaehlt und nicht fuer den
 * Web-Server insgesamt. Quelle ist nur X-Real-IP: Caddy setzt ihn auf der Web-Route per header_up und
 * ueberschreibt dabei einen vom Client mitgeschickten Wert. Ohne Header (lokal) wird nichts weitergereicht.
 * Die API vertraut X-Forwarded-For nur von privaten Netzen (TRUST_PROXY).
 */
export async function forwardedFor(): Promise<Record<string, string>> {
  try {
    const ip = (await headers()).get("x-real-ip")?.trim();
    return ip && IP.test(ip) ? { "x-forwarded-for": ip } : {};
  } catch (err) {
    unstable_rethrow(err); // Next-interne Signale (z. B. dynamisches Rendern) nicht verschlucken
    return {}; // ausserhalb einer Anfrage (Tests)
  }
}

export class PublicApiError extends Error {
  constructor(readonly status: number) {
    super(`Oeffentliche API antwortet mit ${status}`);
  }
}

/** Marker fuer „Rate-Limit erreicht“ (429), damit die Seite eine eigene Meldung statt der Fehlerseite zeigt. */
export const RATE_LIMITED = Symbol("rate-limited");

/** 429 -> RATE_LIMITED, alle anderen Fehler weiterwerfen. Nutzung: fetchPublic(...).catch(rateLimited) */
export function rateLimited(err: unknown): typeof RATE_LIMITED {
  if (err instanceof PublicApiError && err.status === 429) return RATE_LIMITED;
  throw err;
}

/**
 * GET auf /public/...: 404 -> null, andere Fehler werfen. Kein Next-Datencache (no-store): die API cacht
 * zentral in Redis und leert dort sofort; ein Next-Cache je Besucher-IP wuerde das aushebeln und unbegrenzt wachsen.
 */
export async function fetchPublic<T>(path: string): Promise<T | null> {
  const res = await fetch(`${apiInternalUrl()}/public${path}`, { headers: await forwardedFor(), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new PublicApiError(res.status);
  return (await res.json()) as T;
}
