import type { MetadataRoute } from "next";
import { ALLOW_INDEXING, SITE_URL } from "@/lib/site-meta";

// Crawlen bleibt fuer oeffentliche Seiten erlaubt (Link-Vorschauen), Indexieren steuert das robots-Meta im Layout.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: ALLOW_INDEXING
      ? { userAgent: "*", allow: ["/", "/datenschutz", "/impressum", "/agb", "/vereine-finden", "/verein/"], disallow: ["/api/", "/feed", "/chat", "/einstellungen", "/verwaltung", "/plattform"] }
      : { userAgent: "*", disallow: "/" },
    sitemap: ALLOW_INDEXING ? `${SITE_URL}/sitemap.xml` : undefined,
  };
}
