/** Alle Rechtsseiten (Fusszeile, Sitemap, robots.txt und Tests nutzen dieselbe Liste). */
export const LEGAL_LINKS: { href: string; label: string }[] = [
  { href: "/datenschutz", label: "Datenschutz" },
  { href: "/impressum", label: "Impressum" },
  { href: "/agb", label: "Nutzungsbedingungen" },
  { href: "/community-richtlinien", label: "Community-Richtlinien" },
  { href: "/meldeverfahren", label: "Melden und DSA-Kontakt" },
  { href: "/barrierefreiheit", label: "Barrierefreiheit" },
];

/** Hilfe und Kontakt (ebenfalls ohne Login erreichbar). */
export const HELP_LINKS: { href: string; label: string }[] = [
  { href: "/hilfe", label: "Hilfe" },
  { href: "/kontakt", label: "Kontakt" },
];
