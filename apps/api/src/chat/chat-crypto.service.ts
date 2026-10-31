import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";

const b64 = (b: Buffer) => b.toString("base64url");
const fromB64 = (s: string) => Buffer.from(s, "base64url");

/**
 * Verschluesselung der Chat-Inhalte (Speicherung, "at rest"):
 *  - Je Unterhaltung ein zufaelliger Datenschluessel (32 Byte).
 *  - Der Datenschluessel wird mit einem Master-Schluessel (Umgebungsvariable, nicht in der Datenbank) umhuellt.
 *  - Nachrichten: AES-256-GCM, frischer IV je Nachricht, Zusatzdaten (AAD) binden den Text an Unterhaltung+Nachricht.
 *  - Rotation: neuer Master-Schluessel + Job `chat.rewrap-keys`; Nachrichten muessen nicht neu verschluesselt werden.
 * Hinweis: Das ist KEINE Ende-zu-Ende-Verschluesselung. Der Server kann Inhalte entschluesseln (noetig fuer Meldungen,
 * Auskunft nach Art. 15 DSGVO und Moderation). E2EE ist als spaetere Option fuer 1:1 vorgesehen.
 */
@Injectable()
export class ChatCrypto {
  private readonly keys = new Map<number, Buffer>();
  readonly activeVersion: number;

  constructor() {
    const raw = process.env.CHAT_MASTER_KEYS; // "1:<base64>,2:<base64>"
    if (raw) {
      for (const part of raw.split(",")) {
        const [v, k] = part.trim().split(":");
        const key = Buffer.from(k ?? "", "base64");
        if (!Number.isInteger(Number(v)) || key.length !== 32) {
          throw new Error("CHAT_MASTER_KEYS ungueltig: erwartet '<version>:<32 Byte base64>'.");
        }
        this.keys.set(Number(v), key);
      }
      this.activeVersion = Number(process.env.CHAT_ACTIVE_KEY_VERSION ?? Math.max(...this.keys.keys()));
      if (!this.keys.has(this.activeVersion)) throw new Error("CHAT_ACTIVE_KEY_VERSION hat keinen passenden Schluessel.");
    } else if (process.env.NODE_ENV === "production") {
      throw new Error("CHAT_MASTER_KEYS fehlt: Der Chat startet in Produktion nicht ohne Master-Schluessel.");
    } else {
      new Logger("ChatCrypto").warn("CHAT_MASTER_KEYS fehlt: temporaerer Entwicklungsschluessel (Daten nicht dauerhaft lesbar).");
      this.keys.set(1, randomBytes(32));
      this.activeVersion = 1;
    }
  }

  newDataKey(): Buffer {
    return randomBytes(32);
  }

  wrap(dataKey: Buffer): { wrapped: string; version: number } {
    return { wrapped: this.seal(this.master(this.activeVersion), dataKey, "conversation-key"), version: this.activeVersion };
  }

  unwrap(wrapped: string, version: number): Buffer {
    return this.open(this.master(version), wrapped, "conversation-key");
  }

  /** Haengt einen Datenschluessel von einer alten auf die aktive Master-Version um. */
  rewrap(wrapped: string, fromVersion: number): { wrapped: string; version: number } {
    return this.wrap(this.unwrap(wrapped, fromVersion));
  }

  encrypt(dataKey: Buffer, plaintext: string, aad: string): string {
    return this.seal(dataKey, Buffer.from(plaintext, "utf8"), aad);
  }

  decrypt(dataKey: Buffer, token: string, aad: string): string {
    return this.open(dataKey, token, aad).toString("utf8");
  }

  private master(version: number): Buffer {
    const key = this.keys.get(version);
    if (!key) throw new Error(`Master-Schluessel Version ${version} nicht vorhanden.`);
    return key;
  }

  private seal(key: Buffer, data: Buffer, aad: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([cipher.update(data), cipher.final()]);
    return `${b64(iv)}.${b64(cipher.getAuthTag())}.${b64(ct)}`;
  }

  private open(key: Buffer, token: string, aad: string): Buffer {
    const [iv, tag, ct] = token.split(".");
    if (!iv || !tag || ct === undefined) throw new Error("Ungueltiges Chiffrat.");
    const decipher = createDecipheriv("aes-256-gcm", key, fromB64(iv));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(fromB64(tag));
    return Buffer.concat([decipher.update(fromB64(ct)), decipher.final()]);
  }
}
