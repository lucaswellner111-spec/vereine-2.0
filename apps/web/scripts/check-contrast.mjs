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
const light = tokens(block(":root {"));
const dark = tokens(block(':root[data-theme="dark"]'));

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
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
];
let failed = 0;
for (const [name, set] of [["Hell", light], ["Dunkel", dark]]) {
  for (const [fg, bg, min, label] of PAIRS) {
    const r = ratio(set[fg], set[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`${ok ? "OK  " : "FAIL"} ${name.padEnd(6)} ${label.padEnd(34)} ${r.toFixed(2)}:1 (min ${min})`);
  }
}
process.exit(failed ? 1 : 0);
