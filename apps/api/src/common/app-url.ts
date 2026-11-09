import { ServiceUnavailableException } from "@nestjs/common";

/**
 * Oeffentliche Adresse der Web-App fuer Links in E-Mails: `APP_URL`, sonst `WEB_ORIGIN` (erste Angabe), in
 * Entwicklung/Tests http://localhost:3000. In Produktion ohne beides: Fehler statt kaputter Links.
 */
export function appUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.APP_URL?.trim() || env.WEB_ORIGIN?.split(",")[0]?.trim() || "").replace(/\/+$/, "");
  if (raw) return raw;
  if (env.NODE_ENV === "production") throw new ServiceUnavailableException("APP_URL bzw. WEB_ORIGIN ist nicht gesetzt.");
  return "http://localhost:3000";
}

/** Absoluter Link zu einem Pfad der Web-App (Pfad beginnt mit "/"). */
export const appLink = (path: string) => `${appUrl()}${path}`;
