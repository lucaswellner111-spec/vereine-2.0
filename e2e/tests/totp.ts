import { createHmac } from "node:crypto";

/** Minimale TOTP (RFC 6238: HMAC-SHA1, 30 s, 6 Stellen) fuer E2E-Tests, ohne zusaetzliche Abhaengigkeit. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/[\s=]+/g, "").toUpperCase()) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Code fuer den Zeitschritt, der `stepOffset` Schritte (je 30 s) nach jetzt liegt. */
export function totpCode(secretBase32: string, stepOffset = 0, nowMs = Date.now()): string {
  const counter = Math.floor(nowMs / 30_000) + stepOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", base32Decode(secretBase32)).update(msg).digest();
  const o = mac[mac.length - 1] & 15;
  const bin = ((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}
