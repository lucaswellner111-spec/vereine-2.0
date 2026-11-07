/** Oeffentliche Adresse und Such-Freigabe. Bis zum Launch bleibt alles "noindex" (Vorschau mit Testdaten). */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://klubnest.de";
export const ALLOW_INDEXING = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "1";
export const SITE_DESCRIPTION = "Die datenschutzfreundliche Plattform für Vereine, Mitglieder und Fans – gehostet in Deutschland.";
