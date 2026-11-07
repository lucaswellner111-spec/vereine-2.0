/** Postgres-Fehlercode; Drizzle verpackt Treiberfehler in DrizzleQueryError mit `cause`. */
export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null | undefined;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" ? code : undefined;
}

/** Eindeutigkeitsverletzung (23505), z. B. Slug/Handle/E-Mail bereits vergeben. */
export function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === "23505";
}
