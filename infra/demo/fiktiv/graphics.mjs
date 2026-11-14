// Selbst erzeugte Platzhalter-Grafiken fuer die Demo (reine Geometrie, KEINE Fotos, KEINE Personen, keine Fremdlizenzen).
// Erzeugt PNG ohne Abhaengigkeiten (node:zlib). Gleicher Name + Groesse = gleiches Bild (deterministisch).
import { deflateSync } from "node:zlib";

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePng(w, h, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 8 Bit
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // Filter "keiner"
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** Paletten (Vereinsfarben der fiktiven Vereine). */
export const PALETTES = {
  wald: ["#1f6f50", "#e8f3ec", "#f2b84b"],
  himmel: ["#1d4e89", "#e6eefa", "#f08a4b"],
  abend: ["#6b2d5c", "#f5e9f1", "#f2c14e"],
};

/**
 * Zeichnet ein abstraktes Bild. kind: sunburst | stripes | circles | waves | grid | crest
 * Rueckgabe: PNG-Buffer.
 */
export function render(kind, w, h, paletteName = "wald") {
  const [c1, c2, c3] = PALETTES[paletteName].map(hex);
  const px = Buffer.alloc(w * h * 3);
  const set = (x, y, c) => {
    const i = (y * w + x) * 3;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  };
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = mix(c2, c1, y / h * 0.35);
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      switch (kind) {
        case "sunburst":
          c = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 24) % 2 ? mix(c1, c2, r / w) : mix(c3, c2, r / w);
          if (r < h * 0.14) c = c3;
          break;
        case "stripes":
          c = Math.floor((x + y) / (w / 14)) % 2 ? c1 : mix(c1, c2, 0.75);
          if (Math.hypot(x - w * 0.7, y - h * 0.35) < h * 0.17) c = c3;
          break;
        case "circles":
          c = mix(c2, c1, 0.12);
          for (const [fx, fy, fr, col] of [[0.25, 0.4, 0.28, c1], [0.62, 0.55, 0.32, c3], [0.82, 0.25, 0.16, mix(c1, c2, 0.4)]]) {
            if (Math.hypot(x - w * fx, y - h * fy) < h * fr) c = col;
          }
          break;
        case "waves": {
          const wave = h * 0.5 + Math.sin(x / (w / 9)) * h * 0.12 + Math.sin(x / (w / 23)) * h * 0.04;
          c = y > wave ? mix(c1, c2, (y - wave) / h) : mix(c2, c3, 0.25 * (1 - y / wave));
          if (Math.hypot(x - w * 0.8, y - h * 0.2) < h * 0.1) c = c3;
          break;
        }
        case "grid":
          c = (Math.floor(x / (w / 12)) + Math.floor(y / (w / 12))) % 2 ? mix(c1, c2, 0.15) : mix(c1, c2, 0.55);
          if (Math.abs(dx) < w * 0.05 || Math.abs(dy) < h * 0.05) c = c3;
          break;
        case "crest": {
          // Wappen: Kreis mit Schild-Raute und Querbalken (ohne Schrift)
          c = c2;
          if (r < Math.min(w, h) * 0.46) c = c1;
          if (r < Math.min(w, h) * 0.38 && Math.abs(dx) + Math.abs(dy) < Math.min(w, h) * 0.3) c = c2;
          if (Math.abs(dy) < h * 0.05 && Math.abs(dx) < w * 0.3) c = c3;
          break;
        }
        default:
          throw new Error(`Unbekannte Grafik: ${kind}`);
      }
      set(x, y, c);
    }
  }
  return encodePng(w, h, px);
}

/** Avatar fuer erfundene Personen: Farbfleck-Muster aus dem Namen, keine Gesichter. */
export function avatar(name, size = 256) {
  let seed = 0;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const palette = Object.keys(PALETTES)[seed % 3];
  return render(["circles", "stripes", "grid", "sunburst"][(seed >>> 3) % 4], size, size, palette);
}
