import { BadRequestException } from "@nestjs/common";

/** Keyset-Cursor (Zeitstempel als Postgres-Text, mikrosekundengenau, plus ID). */
export type Cursor = { ts: string; id: string };

const TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify({ ts: c.ts, id: c.id })).toString("base64url");

/** Liefert null ohne Cursor; ungueltige Werte (auch kaputte Zeitstempel/IDs) ergeben 400 statt eines DB-Fehlers. */
export function decodeCursor(raw?: string): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString());
    if (c && typeof c.ts === "string" && typeof c.id === "string" && TS.test(c.ts) && UUID.test(c.id)) return { ts: c.ts, id: c.id };
  } catch {
    /* ungueltig */
  }
  throw new BadRequestException("Ungültiger Cursor.");
}
