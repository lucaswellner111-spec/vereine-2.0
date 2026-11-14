import type { CaptchaChallenge, CaptchaConfig, CaptchaSolution } from "@vereine/shared";
import { sha256Hex } from "./sha256";

/** Sucht die Zahl zur Aufgabe (Proof-of-Work). Gibt die Hauptschleife regelmaessig frei, damit die Seite bedienbar bleibt. */
export async function solveChallenge(c: CaptchaChallenge, signal?: AbortSignal): Promise<CaptchaSolution> {
  for (let n = 0; n <= c.maxnumber; n++) {
    if (sha256Hex(`${c.salt}${n}`) === c.challenge) {
      return { algorithm: c.algorithm, challenge: c.challenge, salt: c.salt, signature: c.signature, number: n };
    }
    if (n % 2000 === 1999) {
      if (signal?.aborted) throw new DOMException("Abgebrochen", "AbortError");
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  throw new Error("Die Sicherheitsprüfung konnte nicht gelöst werden.");
}

/** base64 von JSON, so erwartet es der Server im Header X-Captcha. */
export function encodeSolution(s: CaptchaSolution): string {
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

let enabled: Promise<boolean> | null = null;

/** Fragt einmal je Seitenaufruf, ob die Pruefung auf dem Server aktiv ist. Fehler = aus (der Server entscheidet ohnehin). */
function captchaEnabled(): Promise<boolean> {
  enabled ??= fetch("/api/captcha/config", { credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<CaptchaConfig>) : { enabled: false }))
    .then((c) => c.enabled)
    .catch(() => false);
  return enabled;
}

/**
 * Holt eine frische Aufgabe und loest sie (meist unter einer Sekunde, ohne Zutun der Person).
 * null = Pruefung auf dem Server aus. Jede Aufgabe gilt nur fuer eine Anfrage.
 */
export async function captchaToken(signal?: AbortSignal): Promise<string | null> {
  if (!(await captchaEnabled())) return null;
  const res = await fetch("/api/captcha/challenge", { credentials: "same-origin", signal });
  if (!res.ok) throw new Error("Die Sicherheitsprüfung ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.");
  return encodeSolution(await solveChallenge((await res.json()) as CaptchaChallenge, signal));
}

/** Nur fuer Tests. */
export function resetCaptchaCache(): void {
  enabled = null;
}
