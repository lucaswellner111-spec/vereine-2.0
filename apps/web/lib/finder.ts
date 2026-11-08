import { ORG_CATEGORIES, PUBLIC_PAGE_SIZE, isTagId } from "@vereine/shared";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

/** Vereinsfinder: Eingaben aus der URL -> Abfrage der oeffentlichen API (ungueltige Werte fallen weg). */
export function finderQuery(sp: Record<string, string | string[] | undefined>) {
  const q = one(sp.q).slice(0, 80);
  const ort = one(sp.ort).slice(0, 60);
  const tag = isTagId(one(sp.tag)) ? one(sp.tag) : "";
  const kategorie = (ORG_CATEGORIES as readonly string[]).includes(one(sp.kategorie)) ? one(sp.kategorie) : "";
  const seite = Math.min(100, Math.max(1, Number.parseInt(one(sp.seite), 10) || 1));
  const api = new URLSearchParams();
  if (q) api.set("q", q);
  if (ort) api.set("city", ort);
  if (tag) api.set("tag", tag);
  if (kategorie) api.set("category", kategorie);
  if (seite > 1) api.set("offset", String((seite - 1) * PUBLIC_PAGE_SIZE));
  return { q, ort, tag, kategorie, seite, apiQuery: api.toString() };
}

/** Link auf eine Seite des Finders mit denselben Filtern. */
export function finderLink(f: { q: string; ort: string; tag: string; kategorie: string }, seite: number): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.ort) p.set("ort", f.ort);
  if (f.tag) p.set("tag", f.tag);
  if (f.kategorie) p.set("kategorie", f.kategorie);
  if (seite > 1) p.set("seite", String(seite));
  return `/vereine-finden${p.size ? `?${p}` : ""}`;
}
