import { CAPTCHA_HEADER } from "@vereine/shared";
import { captchaToken } from "./captcha";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

/** captcha: vor dem Senden die Sicherheitspruefung (Proof-of-Work) loesen und als Header mitschicken, sofern der Server sie verlangt. */
type Options = { method?: string; body?: unknown; signal?: AbortSignal; captcha?: boolean };

/** Duenner Fetch-Wrapper. Alle Aufrufe gehen same-origin an /api (Caddy bzw. Next-Rewrite -> NestJS). */
export async function api<T = void>(path: string, { method = "GET", body, signal, captcha }: Options = {}): Promise<T> {
  const token = captcha ? await captchaToken(signal) : null;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers[CAPTCHA_HEADER] = token;
  const res = await fetch(`/api${path}`, {
    method,
    signal,
    credentials: "same-origin",
    headers: Object.keys(headers).length ? headers : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = typeof data?.message === "string" ? data.message : "Etwas ist schiefgelaufen.";
    const fields = data?.message && typeof data.message === "object" ? (data.message as Record<string, string[]>) : undefined;
    throw new ApiError(res.status, message, fields);
  }
  return data as T;
}

/** Zeigt Feldfehler der API (Zod flatten) als lesbaren Text. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.fields) {
      const first = Object.entries(err.fields)[0];
      if (first) return `${first[0]}: ${first[1][0]}`;
    }
    // 429: konkreten Servertext zeigen (z. B. Nutzungslimit), sonst allgemeiner Hinweis
    if (err.status === 429) return err.message && err.message !== "Etwas ist schiefgelaufen." ? err.message : "Zu viele Versuche. Bitte warte kurz.";
    return err.message;
  }
  return "Verbindung fehlgeschlagen. Bitte versuche es erneut.";
}
