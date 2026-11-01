// Erzeugt die PWA-Icons (einmalig; Ergebnis liegt in public/icons). Start: node apps/web/scripts/make-icons.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// Buchstabe "K" als Pfad (keine Schrift noetig); safe = Anteil der Flaeche fuer maskierbare Icons.
const svg = (size, safe) => {
  const s = size;
  const pad = (1 - safe) / 2;
  const u = (v) => (pad + v * safe) * s;
  const w = 0.14;
  const K = `
    <path d="M${u(0.30)} ${u(0.22)} h${w * safe * s} v${0.56 * safe * s} h${-w * safe * s} z" fill="#fff"/>
    <path d="M${u(0.44)} ${u(0.52)} L${u(0.68)} ${u(0.22)} h${0.17 * safe * s} L${u(0.57)} ${u(0.57)} z" fill="#fff"/>
    <path d="M${u(0.52)} ${u(0.48)} L${u(0.70)} ${u(0.78)} h${-0.17 * safe * s} L${u(0.42)} ${u(0.58)} z" fill="#fff"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" rx="${s * 0.22}" fill="#1f7a4d"/>${K}</svg>`;
};
const maskable = (size) => svg(size, 0.8).replace(/rx="[\d.]+"/, 'rx="0"'); // volle Flaeche, Inhalt im sicheren Bereich

await sharp(Buffer.from(svg(192, 1))).png().toFile(join(out, "icon-192.png"));
await sharp(Buffer.from(svg(512, 1))).png().toFile(join(out, "icon-512.png"));
await sharp(Buffer.from(maskable(512))).png().toFile(join(out, "icon-maskable-512.png"));
await sharp(Buffer.from(maskable(180))).png().toFile(join(out, "apple-touch-icon.png"));
console.log("Icons erzeugt in", out);
