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

/*
 * Gleichzeitige identische GET-Anfragen teilen sich eine Antwort: mehrere Bausteine einer Seite (Glocke, Hub,
 * Checkliste, Seitenkopf ...) fragen oft dieselbe Ressource im selben Augenblick ab. Der Eintrag lebt nur, solange die
 * Anfrage laeuft (kein Cache, keine veralteten Daten). Der Abbruch (signal) gilt je Aufrufer: er beendet nur dessen
 * Warten, die gemeinsame Anfrage laeuft weiter.
 */
type Shared = { response: Promise<Response>; controller: AbortController; refs: number };
const inflight = new Map<string, Shared>();

function abortError() {
  return new DOMException("Aborted", "AbortError");
}

function sharedGet(url: string, signal?: AbortSignal): Promise<Response> {
  if (signal?.aborted) return Promise.reject(abortError());
  let entry = inflight.get(url);
  if (!entry) {
    const controller = new AbortController();
    const created: Shared = { response: fetch(url, { method: "GET", credentials: "same-origin", signal: controller.signal }), controller, refs: 0 };
    entry = created;
    inflight.set(url, created);
    const clear = () => {
      if (inflight.get(url) === created) inflight.delete(url);
    };
    created.response.then(clear, clear);
  }
  const current = entry;
  current.refs += 1;
  return new Promise<Response>((resolve, reject) => {
    let finished = false;
    const onAbort = () => {
      if (finished) return;
      finished = true;
      // Erst wenn kein Aufrufer mehr wartet, wird die gemeinsame Anfrage wirklich abgebrochen
      current.refs -= 1;
      if (current.refs <= 0) {
        if (inflight.get(url) === current) inflight.delete(url);
        current.controller.abort();
      }
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    current.response.then(
      // Jeder Aufrufer bekommt eine eigene Kopie, damit der Koerper mehrfach gelesen werden kann
      (r) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener("abort", onAbort);
        resolve(r.clone());
      },
      (e) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

/** Duenner Fetch-Wrapper. Alle Aufrufe gehen same-origin an /api (Caddy bzw. Next-Rewrite -> NestJS). */
export async function api<T = void>(path: string, { method = "GET", body, signal, captcha }: Options = {}): Promise<T> {
  const token = captcha ? await captchaToken(signal) : null;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers[CAPTCHA_HEADER] = token;
  const res = method === "GET" && !token ? await sharedGet(`/api${path}`, signal) : await fetch(`/api${path}`, {
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
