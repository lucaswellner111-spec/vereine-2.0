import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ChatCrypto } from "./chat-crypto.service";

const k = () => randomBytes(32).toString("base64");

describe("ChatCrypto", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("verschluesselt und entschluesselt; jeder Chiffretext ist anders (frischer IV)", () => {
    const c = new ChatCrypto();
    const key = c.newDataKey();
    const a = c.encrypt(key, "Hallo Welt 🌍 äöü", "conv:msg");
    const b = c.encrypt(key, "Hallo Welt 🌍 äöü", "conv:msg");
    expect(a).not.toBe(b);
    expect(a).not.toContain("Hallo");
    expect(c.decrypt(key, a, "conv:msg")).toBe("Hallo Welt 🌍 äöü");
  });

  it("erkennt Manipulation, falschen Schluessel und verschobene Chiffrate (AAD)", () => {
    const c = new ChatCrypto();
    const key = c.newDataKey();
    const token = c.encrypt(key, "geheim", "conv1:msg1");
    const [iv, tag, ct] = token.split(".");
    const bytes = Buffer.from(ct, "base64url");
    bytes[0] ^= 1;
    const flipped = `${iv}.${tag}.${bytes.toString("base64url")}`;
    expect(() => c.decrypt(key, flipped, "conv1:msg1")).toThrow();
    expect(() => c.decrypt(c.newDataKey(), token, "conv1:msg1")).toThrow();
    expect(() => c.decrypt(key, token, "conv2:msg1")).toThrow(); // in andere Unterhaltung verschoben
    expect(() => c.decrypt(key, "kaputt", "x")).toThrow();
  });

  it("Master-Schluessel: Umhuellen und Rotation ohne Nachrichten neu zu verschluesseln", () => {
    const k1 = k();
    const k2 = k();
    process.env.CHAT_MASTER_KEYS = `1:${k1}`;
    const v1 = new ChatCrypto();
    const dataKey = v1.newDataKey();
    const { wrapped, version } = v1.wrap(dataKey);
    const message = v1.encrypt(dataKey, "bleibt lesbar", "c:m");
    expect(version).toBe(1);

    process.env.CHAT_MASTER_KEYS = `1:${k1},2:${k2}`;
    process.env.CHAT_ACTIVE_KEY_VERSION = "2";
    const v2 = new ChatCrypto();
    expect(v2.activeVersion).toBe(2);
    const moved = v2.rewrap(wrapped, 1);
    expect(moved.version).toBe(2);
    expect(moved.wrapped).not.toBe(wrapped);
    expect(v2.decrypt(v2.unwrap(moved.wrapped, 2), message, "c:m")).toBe("bleibt lesbar"); // alte Nachricht, neuer Master

    // Nur der neue Master reicht nach der Rotation, der alte darf entfallen
    process.env.CHAT_MASTER_KEYS = `2:${k2}`;
    expect(new ChatCrypto().unwrap(moved.wrapped, 2).equals(dataKey)).toBe(true);
  });

  it("Konfigurationsfehler und Produktionsschutz", () => {
    process.env.CHAT_MASTER_KEYS = "1:zukurz";
    expect(() => new ChatCrypto()).toThrow(/ungueltig/);
    delete process.env.CHAT_MASTER_KEYS;
    process.env.NODE_ENV = "production";
    expect(() => new ChatCrypto()).toThrow(/CHAT_MASTER_KEYS fehlt/);
    process.env.CHAT_MASTER_KEYS = `1:${k()}`;
    process.env.CHAT_ACTIVE_KEY_VERSION = "7";
    expect(() => new ChatCrypto()).toThrow(/ACTIVE_KEY_VERSION/);
  });
});
