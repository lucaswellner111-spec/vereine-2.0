import { YOUTH_AGE_LIMIT, YOUTH_AGE_MIN, type YouthConsentPurpose } from "@vereine/shared";

/** Kalendertag als "JJJJ-MM-TT" aus lokalen Teilen (Geburtsdatum-Eingabe, kein Zeitzonenfehler). */
const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Grenzen fuer das Geburtsdatum-Feld: mindestens 6 und unter 16 Jahre alt.
 * min = Tag nach dem Geburtstag vor 16 Jahren (heute wuerde das Kind 16), max = heute vor 6 Jahren.
 */
export function birthDateRange(today: Date = new Date()): { min: string; max: string } {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const minDay = new Date(y - YOUTH_AGE_LIMIT, m - 1, d + 1);
  return { min: iso(minDay.getFullYear(), minDay.getMonth() + 1, minDay.getDate()), max: iso(y - YOUTH_AGE_MIN, m, d) };
}

/** Token aus einem eingefuegten Einladungslink (".../einladung/<token>") oder dem nackten Token. Leer bei Unsinn. */
export function inviteTokenFrom(input: string): string {
  const raw = input.trim();
  const m = raw.match(/\/einladung\/([A-Za-z0-9_-]{20,200})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,200}$/.test(raw) ? raw : "";
}

/** Vereinsadresse aus einem eingefuegten Link (".../vereine/<slug>") oder der nackten Adresse. Leer bei Unsinn. */
export function orgSlugFrom(input: string): string {
  const raw = input.trim().toLowerCase();
  const m = raw.match(/\/vereine\/([a-z0-9-]{2,80})/);
  if (m) return m[1];
  return /^[a-z0-9-]{2,80}$/.test(raw) ? raw : "";
}

export const CONSENT_LABEL: Record<YouthConsentPurpose, string> = {
  account: "Jugendkonto angelegt (Selbstauskunft: du bist sorgeberechtigt)",
  org_membership: "Mitgliedschaft im Verein",
};

/** Was zum Kind gespeichert wird (Elternbereich, gleiche Aussage wie in der Doku). */
export const STORED_ABOUT_CHILD: string[] = [
  "Name: auf der Plattform nur Vorname und Initiale („Lena K.“), der Vorstand deiner Vereine sieht den vollen Namen.",
  "Geburtsdatum: nur für die Altersprüfung. Am 16. Geburtstag braucht dein Kind ein eigenes Konto.",
  "Mitgliedschaften, Zu- und Absagen und Helfer-Eintragungen, die du für dein Kind machst.",
  "Anwesenheit beim Training, das erfasst nur der Verein. Einen Grund für Fehlen gibt es nicht.",
  "Ein zweiter Elternteil (nur mit deiner Einladung und eigenem Konto) sieht und verwaltet dein Kind mit. Freigaben gelten restriktiv: Widerspricht einer von euch, gilt es nicht.",
  "Rechnungen für dein Kind gehen an dich. Der Verein sieht nur den Namen deines Kindes auf der Rechnung.",
];

export const NOT_STORED_ABOUT_CHILD =
  "Kein Profil, keine Fotos, keine Chats, keine Beiträge, kein Standort. Dein Kind taucht nirgends in der Suche auf und kann von Erwachsenen nicht angeschrieben werden.";
