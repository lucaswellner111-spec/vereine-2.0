import { sql, type SQL } from "drizzle-orm";

/**
 * Loeschfristen (Speicherbegrenzung, Art. 5 Abs. 1 lit. e DSGVO), dokumentiert in docs/DATENSCHUTZ-LAUNCH.md.
 * Die Bereichsdienste loeschen ihre eigenen Tabellen (`purgeExpired`), der Job `privacy.retention` ruft sie taeglich auf.
 */
export const RETENTION = {
  notifications: "180 days",
  deletedPosts: "30 days",
  auditDefault: "12 months",
  /** Plattform- und Vereinsmoderation (DSA: Beschwerden, Transparenzbericht, Rechtsstreit). */
  auditModeration: "24 months",
  /** Rechnungsaktionen (finalisiert/bezahlt/storniert) wie die Rechnungen selbst (GoBD/AO). */
  auditFinance: "10 years",
  attendance: "24 months",
  /** Abgelaufene/widerrufene Einladungen bleiben noch kurz in der Liste des Vorstands sichtbar. */
  invites: "30 days",
  /** Einmal-Links (Bestaetigung, Passwort, E-Mail-Wechsel): 7 Tage nach Ablauf. */
  authTokens: "7 days",
  /** Registrierungen ohne Bestaetigung (Konto nie nutzbar) werden danach geloescht. */
  pendingAccounts: "7 days",
  /** Sperrliste: harte Bounces/Beschwerden bzw. Abmeldungen von Einladungs-Mails. */
  mailBounce: "12 months",
  mailUnsubscribe: "36 months",
  /** Vorgemerkte Mitglieder aus dem CSV-Import, deren Einladung nie verschickt wurde (versendete: bei Ablauf der Einladung). */
  pendingMembersUnsent: "60 days",
} as const;

/** Je Runde hoechstens so viele Zeilen (kurze Sperren, kleine Transaktionen). */
export const RETENTION_BATCH = 1000;
/** Sicherheitsgrenze je Lauf und Schritt (100.000 Zeilen); der Rest folgt am naechsten Tag. */
const MAX_ROUNDS = 100;

/** `now() - interval '…'` als SQL (nie ein JS-Date im freien SQL, sonst scheitert postgres-js). Nur feste Konstanten. */
export const ago = (interval: (typeof RETENTION)[keyof typeof RETENTION]): SQL => sql`now() - ${sql.raw(`interval '${interval}'`)}`;

/** Wiederholt einen Block-Schritt, bis weniger als RETENTION_BATCH Zeilen kamen. */
export async function purgeInRounds(step: () => Promise<number>): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const n = await step();
    total += n;
    if (n < RETENTION_BATCH) break;
  }
  return total;
}
