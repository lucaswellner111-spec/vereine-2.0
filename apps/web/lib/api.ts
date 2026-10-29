export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown };

/** Duenner Fetch-Wrapper. Alle Aufrufe gehen same-origin an /api (Caddy bzw. Next-Rewrite -> NestJS). */
export async function api<T = void>(path: string, { method = "GET", body }: Options = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
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
    if (err.status === 429) return "Zu viele Versuche. Bitte warte kurz.";
    return err.message;
  }
  return "Verbindung fehlgeschlagen. Bitte versuche es erneut.";
}
