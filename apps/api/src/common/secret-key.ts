import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { Logger, ServiceUnavailableException } from "@nestjs/common";

const log = new Logger("SecretKey");
let devKey: Buffer | undefined;

/**
 * Server-Geheimnis AUTH_SECRET_KEY (32 Byte, base64). In Produktion Pflicht; in Entwicklung/Tests ohne Variable
 * ein temporaerer Schluessel je Prozess (damit verschluesselte Daten nach Neustart nicht mehr lesbar sind).
 * `missing` ist die Meldung, wenn der Schluessel in Produktion fehlt.
 */
export function authSecretKey(missing = "Diese Funktion ist auf diesem Server nicht konfiguriert."): Buffer {
  const raw = process.env.AUTH_SECRET_KEY;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new ServiceUnavailableException("AUTH_SECRET_KEY muss 32 Byte (base64) lang sein.");
    return key;
  }
  if (process.env.NODE_ENV === "production") throw new ServiceUnavailableException(missing);
  if (!devKey) {
    log.warn("AUTH_SECRET_KEY fehlt: temporaerer Entwicklungsschluessel (verschluesselte Daten nicht dauerhaft lesbar).");
    devKey = randomBytes(32);
  }
  return devKey;
}

/** Eigener Teilschluessel je Zweck (HKDF-SHA256, `info` z. B. "invite"), damit der Hauptschluessel nicht mehrfach dient. */
export function derivedKey(info: string, missing?: string): Buffer {
  return Buffer.from(hkdfSync("sha256", authSecretKey(missing), Buffer.alloc(0), info, 32));
}

/** AES-256-GCM: Ergebnis `iv.tag.daten` (je base64url). */
export function encryptGcm(key: Buffer, text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptGcm(key: Buffer, blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64url"));
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Ungueltiges Chiffrat.");
  const d = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
