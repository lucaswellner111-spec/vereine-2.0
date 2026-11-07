// Prueft die Farb-Tokens beider Darstellungen auf WCAG-AA-Kontrast. Start: node apps/web/scripts/check-contrast.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "app", "globals.css"), "utf8");
const block = (selector) => {
  const start = css.indexOf(selector);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
};
const tokens = (b) => Object.fromEntries([...b.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));
// Helle Werte: :root-Block bis zum eingebetteten "@variant dark {"; dunkle Werte: einmal im "@variant dark {"-Block.
const rootStart = css.indexOf(":root {");
const variantStart = css.indexOf("@variant dark {", rootStart);
if (rootStart < 0 || variantStart < 0) {
  console.error('FAIL ":root {" oder "@variant dark {" nicht in globals.css gefunden');
  process.exit(1);
}
const light = tokens(css.slice(rootStart, variantStart));
const dark = tokens(block("@variant dark {"));

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/*
 * Farbangabe: "name" (Token) oder "name/alpha@basis" = Token mit Deckkraft alpha auf Token basis
 * (z. B. "brand/0.15@surface" fuer bg-brand/15 auf einer Karte). Komposition wie im Browser in sRGB.
 */
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = (rgb) => "#" + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("");
const resolve = (set, spec) => {
  const m = /^([a-z0-9-]+)\/([0-9.]+)@([a-z0-9-]+)$/.exec(spec);
  if (!m) {
    if (!set[spec]) throw new Error(`Token ${spec} fehlt`);
    return set[spec];
  }
  const [, name, alphaText, base] = m;
  const alpha = Number(alphaText);
  const fg = hexToRgb(resolve(set, name));
  const bg = hexToRgb(resolve(set, base));
  return rgbToHex(fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)));
};

// [Vordergrund, Hintergrund, Mindestkontrast, Beschreibung]
const PAIRS = [
  ["text", "bg", 4.5, "Text auf Seite"],
  ["text", "surface", 4.5, "Text auf Karte"],
  ["muted", "bg", 4.5, "Zweittext auf Seite"],
  ["muted", "surface", 4.5, "Zweittext auf Karte"],
  ["muted", "surface-2", 4.5, "Zweittext auf Flaeche 2"],
  ["brand", "surface", 4.5, "Link/Marke auf Karte"],
  ["brand", "bg", 4.5, "Link/Marke auf Seite"],
  ["brand-contrast", "brand", 4.5, "Text auf Marken-Button"],
  ["brand-contrast", "brand-hover", 4.5, "Text auf Marken-Button (hover)"],
  ["danger", "surface", 4.5, "Fehlertext auf Karte"],
  ["on-danger", "danger", 4.5, "Text auf Fehler-Flaeche"],
  ["accent", "surface", 4.5, "Akzenttext auf Karte"],
  ["border", "surface", 1.2, "Rahmen sichtbar (weich)"],
  // Transparente Flaechen und Texte (Tailwind name/alpha)
  ["brand-contrast/0.85@brand", "brand", 4.5, "Zeitstempel eigene Chat-Blase"],
  ["accent", "accent/0.2@surface", 4.5, "Akzent-Badge auf Karte"],
  ["accent", "accent/0.2@bg", 4.5, "Akzent-Badge auf Seite"],
  ["brand", "brand/0.15@surface", 4.5, "Marken-Badge/aktiv auf Karte"],
  ["brand", "brand/0.15@bg", 4.5, "Marken-Badge/aktiv auf Seite"],
  ["brand", "brand/0.2@surface", 4.5, "Chip-Hover auf Karte"],
  ["danger", "danger/0.1@surface", 4.5, "Fehler-Hinweis auf Karte"],
  ["muted", "accent/0.1@bg", 4.5, "Zweittext auf Akzent-Hinweis"],
  // Abdunklung (Lightbox, Bild-Badges): Text auf Scrim, auch ueber hellem Bild (Worst Case: weiss darunter)
  ["on-scrim", "scrim/0.85@surface", 4.5, "Text in der Lightbox"],
  ["on-scrim", "scrim/0.6@on-scrim", 4.5, "Badge auf hellem Foto"],
  ["on-scrim", "on-scrim/0.15@scrim", 4.5, "Lightbox-Knopf"],
];
let failed = 0;
for (const [name, set] of [["Hell", light], ["Dunkel", dark]]) {
  for (const [fg, bg, min, label] of PAIRS) {
    const r = ratio(resolve(set, fg), resolve(set, bg));
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`${ok ? "OK  " : "FAIL"} ${name.padEnd(6)} ${label.padEnd(34)} ${r.toFixed(2)}:1 (min ${min})`);
  }
}
process.exit(failed ? 1 : 0);
