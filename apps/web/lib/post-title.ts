/** Seitentitel aus dem Textanfang eines Beitrags (ohne Zeilenumbrueche, hoechstens 60 Zeichen); leer = null. */
export function titleFromBody(body: string): string | null {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > 60 ? `${flat.slice(0, 59)}…` : flat;
}
