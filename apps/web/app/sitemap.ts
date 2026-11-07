import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-meta";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/registrieren", "/datenschutz", "/impressum", "/agb"].map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: "monthly" }));
}
