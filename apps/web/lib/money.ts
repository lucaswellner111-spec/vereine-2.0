/** Cent-Betrag als "1.234,56 €". */
export const eurCents = (cents: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

/** Datum "JJJJ-MM-TT" als "TT.MM.JJJJ". */
export const dateDe = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") : "–");

/** Eingabe wie "12,50" oder "12.5" in Cent; null bei ungueltiger Eingabe. */
export function parseEuroToCents(input: string): number | null {
  const s = input.trim().replace(/\s/g, "").replace(/\./g, (m, i, all) => (all.includes(",") ? "" : m)).replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}
