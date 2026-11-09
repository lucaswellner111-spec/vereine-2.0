import { createHmac, timingSafeEqual } from "node:crypto";
import { derivedKey } from "../common/secret-key";

/**
 * Abmeldelink ohne Login: signierter Token (HMAC-SHA256, Teilschluessel "mail-unsubscribe"), ohne Ablauf, ohne Adresse.
 * - digest: Sammelmail eines Kontos abbestellen (u = Nutzer-ID)
 * - invite: keine Einladungs-Mails mehr an diese Adresse (h = Adress-Hash)
 */
export type UnsubscribePayload = { k: "digest"; u: string } | { k: "invite"; h: string };

const key = () => derivedKey("mail-unsubscribe", "Abmeldelinks sind auf diesem Server nicht konfiguriert.");
const sign = (body: string) => createHmac("sha256", key()).update(body).digest("base64url");

export function signUnsubscribe(payload: UnsubscribePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** null bei ungueltiger Signatur oder Form. */
export function verifyUnsubscribe(token: string): UnsubscribePayload | null {
  if (typeof token !== "string" || token.length > 400) return null;
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    if (p.k === "digest" && typeof p.u === "string" && /^[0-9a-f-]{36}$/.test(p.u)) return { k: "digest", u: p.u };
    if (p.k === "invite" && typeof p.h === "string" && /^[0-9a-f]{64}$/.test(p.h)) return { k: "invite", h: p.h };
  } catch {
    /* ungueltig */
  }
  return null;
}
