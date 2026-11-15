import { z } from "zod";

/**
 * Jugendkonten (docs/welle2/JUGEND-KONZEPT.md): Kinder unter 16 haben ein Jugendkonto UNTER dem Elternkonto.
 * Etappe E1: Eltern verwalten alles, das Kind hat keinen eigenen Zugang.
 */

/** Ab dem 16. Geburtstag gilt ein normales Erwachsenenkonto (Art. 8 DSGVO / Deutschland). */
export const YOUTH_AGE_LIMIT = 16;
/** Untergrenze fuer die Anlage eines Jugendkontos (Missbrauchsschutz; Wert noch offen, siehe D2-DOKU). */
export const YOUTH_AGE_MIN = 6;
/** Je Elternteil hoechstens so viele Jugendkonten (haelt Abfragen klein). */
export const MAX_CHILDREN_PER_GUARDIAN = 10;
/** Je Kind hoechstens so viele aktive Elternteile (E2: zwei; weitere Sorgeberechtigte sind eine offene Frage, siehe F1-DOKU). */
export const MAX_GUARDIANS_PER_CHILD = 2;
/** Zweiter Elternteil: Einladung gilt so viele Tage; Loeschung eines Kindes wird dem anderen Elternteil so viele Tage vorher angekuendigt. */
export const GUARDIAN_INVITE_VALID_DAYS = 7;
export const YOUTH_DELETION_NOTICE_DAYS = 7;

export type AccountType = "adult" | "youth";

/** Freigaben (Etappe 1 nur Konto und Vereinsmitgliedschaft; weitere Zwecke folgen mit E3/E4). */
export const YOUTH_CONSENT_PURPOSES = ["account", "org_membership"] as const;
export type YouthConsentPurpose = (typeof YOUTH_CONSENT_PURPOSES)[number];
/** Fassung der angezeigten Einwilligungstexte; bei Aenderung neue Version (der Nachweis speichert Fassung und Pruefsumme). */
export const YOUTH_CONSENT_VERSION = "2026-11-15";

export const YOUTH_CONSENT_TEXTS: Record<YouthConsentPurpose, string> = {
  account:
    "Ich bin sorgeberechtigt für dieses Kind und lege für es ein Jugendkonto an. Ich habe die Hinweise für Eltern zur Verarbeitung der Daten meines Kindes gelesen. Ich kann alle Daten bis zum 16. Geburtstag meines Kindes einsehen, exportieren und löschen.",
  org_membership:
    "Ich stimme zu, dass mein Kind Mitglied in diesem Verein wird. Der Verein sieht dafür den vollen Namen meines Kindes, seine Termin-Zusagen und seine Anwesenheit. Ich kann die Mitgliedschaft jederzeit beenden.",
};

const names = z.string().trim().min(1).max(60);
const isoDate = z.iso.date({ error: "Ungültiges Datum (JJJJ-MM-TT)" });

export const createYouthSchema = z.object({
  firstName: names.max(40),
  lastName: names,
  birthDate: isoDate,
  /** Selbstauskunft: Ich bin sorgeberechtigt (wird als Nachweis gespeichert). */
  confirmGuardian: z.literal(true),
});
export type CreateYouthInput = z.infer<typeof createYouthSchema>;

export const joinOrgForChildSchema = z.object({
  /** Einladungslink-Token ODER Vereinsadresse (slug) fuer einen Antrag. Genau eines von beiden. */
  token: z.string().trim().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/).optional(),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
}).refine((v) => !!v.token !== !!v.slug, { message: "Entweder Einladungslink oder Verein angeben." });
export type JoinOrgForChildInput = z.infer<typeof joinOrgForChildSchema>;

export const inviteGuardianSchema = z.object({ email: z.string().trim().toLowerCase().email("E-Mail-Adresse ist ungültig.").max(254) });
export const setBillingContactSchema = z.object({ guardianId: z.uuid() });
/** Annahme der Einladung: Selbstauskunft "sorgeberechtigt" (wird als Nachweis gespeichert). */
export const acceptGuardianInviteSchema = z.object({ confirmGuardian: z.literal(true) });

export const deleteChildSchema = z.object({ password: z.string().min(1).max(128) });

/**
 * Alter in vollen Jahren an einem Tag (beide als "JJJJ-MM-TT", deutsche Zeit). Der Geburtstag zaehlt ab 00:00 Uhr.
 * Schaltjahr: wer am 29.02. geboren ist, wird in Nicht-Schaltjahren am 01.03. ein Jahr aelter.
 */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Tag, an dem das Kind 16 wird (Geburtstag + 16 Jahre; 29.02. wird in Nicht-Schaltjahren zum 01.03.). */
export function graduationDate(birthDate: string): string {
  const [y, m, d] = birthDate.split("-").map(Number);
  const target = y + YOUTH_AGE_LIMIT;
  const leap = (target % 4 === 0 && target % 100 !== 0) || target % 400 === 0;
  if (m === 2 && d === 29 && !leap) return `${target}-03-01`;
  return `${target}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type YouthOrg = { orgId: string; slug: string; name: string; status: "active" | "pending" };

export type YouthChild = {
  id: string;
  /** Anzeigename auf der Plattform (Vorname + Initiale). */
  name: string;
  /** Voller Name (sehen nur Eltern und der Vorstand der Vereine, in denen das Kind Mitglied ist). */
  fullName: string;
  birthDate: string;
  age: number;
  /** Tag, an dem das Kind 16 wird. */
  graduationDue: string;
  /** Ab dem 16. Geburtstag ruht das Jugendkonto (Aenderungen gesperrt). */
  paused: boolean;
  isBillingContact: boolean;
  orgs: YouthOrg[];
};

export type YouthConsentEntry = {
  purpose: YouthConsentPurpose;
  orgId: string | null;
  orgName: string | null;
  granted: boolean;
  version: string;
  at: string;
};

export type YouthShiftItem = { id: string; title: string; startsAt: string | null; endsAt: string | null; slots: number; taken: number; mine: boolean };
export type YouthEvent = {
  id: string;
  orgSlug: string;
  orgName: string;
  title: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  canceled: boolean;
  /** Zu-/Absage des Kindes (von den Eltern gesetzt). */
  myStatus: "yes" | "maybe" | "no" | "waitlist" | null;
  shifts: YouthShiftItem[];
};

export type YouthChildDetail = YouthChild & {
  consents: YouthConsentEntry[];
  events: YouthEvent[];
  /** Anwesenheit der letzten Termine (nur Status, kein Grund). */
  attendance: { eventTitle: string; startsAt: string; status: "present" | "absent" | "excused" }[];
  /** Geplante Loeschung (zwei Elternteile): Vorankuendigung laeuft, jeder Elternteil kann widersprechen. */
  deletion: { requestedAt: string; deleteAfter: string; byMe: boolean } | null;
};

export type YouthGuardian = { userId: string; name: string; isMe: boolean; isBillingContact: boolean; since: string };
export type YouthGuardianInvite = { id: string; createdAt: string; expiresAt: string };
export type YouthGuardiansView = { guardians: YouthGuardian[]; invites: YouthGuardianInvite[]; canInvite: boolean };
/** Was die eingeladene Person vor der Annahme sieht (nur mit passendem Konto). */
export type GuardianInviteInfo = { inviterName: string; childName: string };
/** Loeschung eines Kindes: sofort (ein Elternteil) oder mit Vorankuendigung (zwei Elternteile). */
export type DeleteChildResult = { status: "deleted" } | { status: "scheduled"; deleteAfter: string };
