import type { MetadataRoute } from "next";
import { HELP_LINKS, LEGAL_LINKS } from "@/lib/legal-links";
import { ALLOW_INDEXING, SITE_URL } from "@/lib/site-meta";

// Crawlen bleibt fuer oeffentliche Seiten erlaubt (Link-Vorschauen), Indexieren steuert das robots-Meta im Layout.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: ALLOW_INDEXING
      ? { userAgent: "*", allow: ["/", ...LEGAL_LINKS.map((l) => l.href), ...HELP_LINKS.map((l) => l.href),"/vereine-finden", "/verein/"], disallow: ["/api/", "/feed", "/chat", "/einstellungen", "/verwaltung", "/plattform", "/warteliste/"] }
      : { userAgent: "*", disallow: "/" },
    sitemap: ALLOW_INDEXING ? `${SITE_URL}/sitemap.xml` : undefined,
  };
}
