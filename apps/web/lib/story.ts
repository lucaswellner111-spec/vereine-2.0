/*
 * Story-Kacheln (1080x1920) fuer Instagram-Stories/WhatsApp-Status: reine Hilfsfunktionen ohne DOM,
 * damit Textkuerzung, Umbruch, Bildausschnitt und Dateiname testbar sind. Das Zeichnen steht in story-share.ts.
 */

export const STORY_W = 1080;
export const STORY_H = 1920;
/** Seitenrand der Kachel; Instagram verdeckt oben/unten ca. 250 px, daher steht dort nur Deko. */
export const STORY_PAD = 96;
export const STORY_SAFE_TOP = 260;
export const STORY_SAFE_BOTTOM = 300;

export type Measure = (text: string, fontSize: number) => number;

/** Leerraum zusammenfassen und auf `max` Zeichen kuerzen (an einer Wortgrenze, mit „…“). */
export function truncateText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?–-]+$/, "")}…`;
}

/**
 * Text in Zeilen umbrechen, die hoechstens `maxWidth` breit sind. Zu lange Woerter werden hart getrennt.
 * Passt der Text nicht in `maxLines`, endet die letzte Zeile mit „…“; `overflow` ist dann true.
 */
export function wrapLines(text: string, maxWidth: number, fontSize: number, measure: Measure, maxLines: number): { lines: string[]; overflow: boolean } {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const fits = (s: string) => measure(s, fontSize) <= maxWidth;
  for (let word of words) {
    while (!fits(word) && word.length > 1) {
      // Ueberlanges Wort (z. B. Link) zeichenweise trennen
      let n = word.length - 1;
      while (n > 1 && !fits(`${word.slice(0, n)}-`)) n--;
      if (line) lines.push(line);
      line = "";
      lines.push(`${word.slice(0, n)}-`);
      word = word.slice(n);
    }
    const next = line ? `${line} ${word}` : word;
    if (fits(next)) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return { lines, overflow: false };
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 0 && !fits(`${last}…`)) last = last.slice(0, -1).trimEnd();
  kept[maxLines - 1] = `${last.replace(/[\s.,;:!?–-]+$/, "")}…`;
  return { lines: kept, overflow: true };
}

/** Groesste Schriftgroesse aus `sizes` (absteigend), bei der der Text ohne Kuerzung in `maxLines` passt; sonst die kleinste (gekuerzt). */
export function fitText(text: string, maxWidth: number, sizes: number[], measure: Measure, maxLines: number): { fontSize: number; lines: string[] } {
  for (const fontSize of sizes) {
    const r = wrapLines(text, maxWidth, fontSize, measure, maxLines);
    if (!r.overflow) return { fontSize, lines: r.lines };
  }
  const fontSize = sizes[sizes.length - 1];
  return { fontSize, lines: wrapLines(text, maxWidth, fontSize, measure, maxLines).lines };
}

/**
 * Wie fitText, aber nach verfuegbarer Hoehe: je Schriftgroesse so viele Zeilen, wie in `maxHeight` passen
 * (Zeilenhoehe = Groesse * lineHeight). So ragt der Text nie in die Fusszeile.
 */
export function fitTextInBox(text: string, maxWidth: number, maxHeight: number, sizes: number[], lineHeight: number, measure: Measure): { fontSize: number; lines: string[]; overflow: boolean } {
  const linesFor = (size: number) => Math.max(1, Math.floor(maxHeight / (size * lineHeight)));
  for (const fontSize of sizes) {
    const r = wrapLines(text, maxWidth, fontSize, measure, linesFor(fontSize));
    if (!r.overflow) return { fontSize, lines: r.lines, overflow: false };
  }
  const fontSize = sizes[sizes.length - 1];
  return { fontSize, ...wrapLines(text, maxWidth, fontSize, measure, linesFor(fontSize)) };
}

/** Bildausschnitt fuer „object-fit: cover“: welcher Teil der Quelle (sx, sy, sw, sh) fuellt das Ziel ohne Verzerrung. */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number): { sx: number; sy: number; sw: number; sh: number } {
  if (srcW <= 0 || srcH <= 0) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const sw = dstW / scale;
  const sh = dstH / scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

/** Text fuer Dateinamen: Umlaute ausschreiben, nur a-z0-9 und Bindestriche, hoechstens 40 Zeichen. */
export function slugPart(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/** z. B. klubnest-termin-sommerfest-2026-07-01.png (Datum im Format JJJJ-MM-TT, Zeitzone Berlin). */
export function storyFileName(kind: "termin" | "beitrag", title: string, iso?: string): string {
  const date = iso ? new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }) : "";
  return ["klubnest", kind, slugPart(title), date].filter(Boolean).join("-") + ".png";
}

const tz = "Europe/Berlin";

/** Datum und Uhrzeit eines Termins fuer die Kachel, z. B. { date: "Sa., 12. Juli", time: "18:00 – 22:00 Uhr" }. */
export function eventWhen(startsAt: string, endsAt: string | null): { date: string; time: string } {
  const s = new Date(startsAt);
  const date = s.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", timeZone: tz });
  const t = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  if (!endsAt) return { date, time: `${t(s)} Uhr` };
  const e = new Date(endsAt);
  const sameDay = s.toLocaleDateString("de-DE", { timeZone: tz }) === e.toLocaleDateString("de-DE", { timeZone: tz });
  return { date, time: sameDay ? `${t(s)} – ${t(e)} Uhr` : `${t(s)} Uhr bis ${e.toLocaleDateString("de-DE", { day: "numeric", month: "short", timeZone: tz })}` };
}
