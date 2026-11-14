import type { MetadataRoute } from "next";
import { unstable_rethrow } from "next/navigation";
import { PUBLIC_PAGE_SIZE, type PublicOrgSummary } from "@vereine/shared";
import { fetchPublic } from "@/lib/public-api";
import { ALLOW_INDEXING, SITE_URL } from "@/lib/site-meta";

export const revalidate = 3600;
/** Hoechstens so viele Seiten des Finders je Erzeugung (30 Vereine je Seite). */
const MAX_PAGES = 50;

/** Oeffentliche Vereinsseiten erst mit ALLOW_INDEXING (Vorschau mit Testdaten bleibt draussen). */
async function orgPages(): Promise<MetadataRoute.Sitemap> {
  if (!ALLOW_INDEXING) return [];
  const out: MetadataRoute.Sitemap = [];
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const rows = (await fetchPublic<PublicOrgSummary[]>(`/orgs?offset=${page * PUBLIC_PAGE_SIZE}`)) ?? [];
      out.push(...rows.map((o) => ({ url: `${SITE_URL}/verein/${o.slug}`, changeFrequency: "weekly" as const })));
      if (rows.length < PUBLIC_PAGE_SIZE) break;
    }
  } catch (err) {
    unstable_rethrow(err);
    // API nicht erreichbar (z. B. beim Build): nur die festen Seiten
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed = ["", "/vereine-finden", "/warteliste", "/registrieren", "/datenschutz", "/impressum", "/agb"].map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: "monthly" as const }));
  return [...fixed, ...(await orgPages())];
}
