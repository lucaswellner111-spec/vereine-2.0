/**
 * Firmendaten fuer Impressum, Datenschutzerklaerung, Nutzungsbedingungen usw. an EINER Stelle.
 * Die Werte kommen aus Umgebungsvariablen (zur Build-Zeit eingebettet, siehe .env.example / infra/README.md).
 * Ist ein Wert nicht gesetzt, steht ein klar erkennbarer Platzhalter "[… Beschreibung …]" im Text.
 * Der Wert "-" bedeutet "gibt es nicht" (nur fuer optionale Felder: Telefon, USt-IdNr.) und blendet die Zeile aus.
 *
 * Wichtig: Jede Variable wird mit ihrem vollen Namen gelesen, sonst ersetzt Next.js sie im Browser-Bundle nicht.
 */

/** Platzhalter beginnen immer mit dieser Zeichenfolge (Test und Build-Pruefung suchen danach). */
export const PLACEHOLDER_PREFIX = "[…";

export function placeholder(label: string): string {
  return `${PLACEHOLDER_PREFIX} ${label} …]`;
}

export function isPlaceholder(value: string): boolean {
  return value.includes(PLACEHOLDER_PREFIX);
}

export type LegalConfig = {
  companyName: string;
  legalForm: string;
  street: string;
  postalCity: string;
  country: string;
  /** Vertretungsberechtigte, z. B. "Max Mustermann (Geschaeftsfuehrer)". */
  representatives: string;
  /** Registergericht und Nummer, z. B. "Amtsgericht Leipzig, HRB 12345". */
  register: string;
  /** Umsatzsteuer-Identifikationsnummer; "-" = keine. */
  vatId: string;
  /** Allgemeine Kontakt-Adresse (Impressum, Kontakt, Hilfe). */
  email: string;
  /** Telefon; "-" = keine Angabe (nicht verpflichtend, wenn E-Mail und Kontaktseite schnelle Kontaktaufnahme erlauben). */
  phone: string;
  /** Kontakt fuer Datenschutz bzw. Datenschutzbeauftragte:n (Name/Stelle + Adresse). */
  dpoContact: string;
  /** Kontaktadresse fuer DSA-Meldungen und Beschwerden (Fallback: allgemeine E-Mail). */
  dsaEmail: string;
  /** Zustaendige Datenschutz-Aufsichtsbehoerde (nach Sitz des Betreibers). */
  authority: string;
};

type Env = Record<string, string | undefined>;

function pick(value: string | undefined, label: string): string {
  const v = value?.trim();
  return v ? v : placeholder(label);
}

/** Baut die Konfiguration aus einem Env-Objekt (fuer Tests austauschbar). */
export function buildLegalConfig(env: Env): LegalConfig {
  const email = pick(env.NEXT_PUBLIC_LEGAL_EMAIL, "E-Mail-Adresse");
  return {
    companyName: pick(env.NEXT_PUBLIC_LEGAL_COMPANY, "Firmenname"),
    legalForm: pick(env.NEXT_PUBLIC_LEGAL_FORM, "Rechtsform (UG (haftungsbeschränkt) oder GmbH)"),
    street: pick(env.NEXT_PUBLIC_LEGAL_STREET, "Straße und Hausnummer"),
    postalCity: pick(env.NEXT_PUBLIC_LEGAL_POSTAL_CITY, "PLZ und Ort"),
    country: env.NEXT_PUBLIC_LEGAL_COUNTRY?.trim() || "Deutschland",
    representatives: pick(env.NEXT_PUBLIC_LEGAL_REPRESENTATIVES, "Vertretungsberechtigte"),
    register: pick(env.NEXT_PUBLIC_LEGAL_REGISTER, "Registergericht und Handelsregisternummer"),
    vatId: pick(env.NEXT_PUBLIC_LEGAL_VAT_ID, "USt-IdNr."),
    email,
    phone: pick(env.NEXT_PUBLIC_LEGAL_PHONE, "Telefonnummer"),
    dpoContact: pick(env.NEXT_PUBLIC_LEGAL_DPO, "Datenschutzbeauftragte:r bzw. Datenschutzkontakt mit E-Mail"),
    dsaEmail: env.NEXT_PUBLIC_LEGAL_DSA_EMAIL?.trim() || email,
    authority: pick(env.NEXT_PUBLIC_LEGAL_AUTHORITY, "zuständige Datenschutz-Aufsichtsbehörde"),
  };
}

export const LEGAL: LegalConfig = buildLegalConfig({
  NEXT_PUBLIC_LEGAL_COMPANY: process.env.NEXT_PUBLIC_LEGAL_COMPANY,
  NEXT_PUBLIC_LEGAL_FORM: process.env.NEXT_PUBLIC_LEGAL_FORM,
  NEXT_PUBLIC_LEGAL_STREET: process.env.NEXT_PUBLIC_LEGAL_STREET,
  NEXT_PUBLIC_LEGAL_POSTAL_CITY: process.env.NEXT_PUBLIC_LEGAL_POSTAL_CITY,
  NEXT_PUBLIC_LEGAL_COUNTRY: process.env.NEXT_PUBLIC_LEGAL_COUNTRY,
  NEXT_PUBLIC_LEGAL_REPRESENTATIVES: process.env.NEXT_PUBLIC_LEGAL_REPRESENTATIVES,
  NEXT_PUBLIC_LEGAL_REGISTER: process.env.NEXT_PUBLIC_LEGAL_REGISTER,
  NEXT_PUBLIC_LEGAL_VAT_ID: process.env.NEXT_PUBLIC_LEGAL_VAT_ID,
  NEXT_PUBLIC_LEGAL_EMAIL: process.env.NEXT_PUBLIC_LEGAL_EMAIL,
  NEXT_PUBLIC_LEGAL_PHONE: process.env.NEXT_PUBLIC_LEGAL_PHONE,
  NEXT_PUBLIC_LEGAL_DPO: process.env.NEXT_PUBLIC_LEGAL_DPO,
  NEXT_PUBLIC_LEGAL_DSA_EMAIL: process.env.NEXT_PUBLIC_LEGAL_DSA_EMAIL,
  NEXT_PUBLIC_LEGAL_AUTHORITY: process.env.NEXT_PUBLIC_LEGAL_AUTHORITY,
});

/** Ein optionales Feld mit Wert "-" gilt als nicht vorhanden. */
export function isOmitted(value: string): boolean {
  return value.trim() === "-";
}

/** Namen der Felder, in denen noch ein Platzhalter steht. */
export function unresolvedLegalFields(cfg: LegalConfig = LEGAL): string[] {
  return (Object.keys(cfg) as (keyof LegalConfig)[]).filter((k) => isPlaceholder(cfg[k]));
}

/** Pflichtvariablen fuer die Build-Pruefung (scripts/check-legal.mjs liest dieselbe Liste aus dieser Datei). */
export const REQUIRED_LEGAL_ENV = [
  "NEXT_PUBLIC_LEGAL_COMPANY",
  "NEXT_PUBLIC_LEGAL_FORM",
  "NEXT_PUBLIC_LEGAL_STREET",
  "NEXT_PUBLIC_LEGAL_POSTAL_CITY",
  "NEXT_PUBLIC_LEGAL_REPRESENTATIVES",
  "NEXT_PUBLIC_LEGAL_REGISTER",
  "NEXT_PUBLIC_LEGAL_VAT_ID",
  "NEXT_PUBLIC_LEGAL_EMAIL",
  "NEXT_PUBLIC_LEGAL_PHONE",
  "NEXT_PUBLIC_LEGAL_DPO",
  "NEXT_PUBLIC_LEGAL_AUTHORITY",
] as const;

/** Meldung, wenn die Seite indexiert werden soll, im Impressum aber noch Platzhalter stehen. null = alles in Ordnung. */
export function legalIndexingWarning(env: Env): string | null {
  if (env.NEXT_PUBLIC_ALLOW_INDEXING !== "1") return null;
  const missing = REQUIRED_LEGAL_ENV.filter((k) => !env[k]?.trim());
  if (missing.length === 0) return null;
  return `NEXT_PUBLIC_ALLOW_INDEXING=1, aber im Impressum stehen noch Platzhalter. Fehlende Variablen: ${missing.join(", ")}`;
}
