import { ageOn as ageOnShared, graduationDate, YOUTH_AGE_LIMIT, YOUTH_AGE_MIN } from "@vereine/shared";
import { berlinDate } from "./berlin-date";

export { graduationDate };

/**
 * Alter in vollen Jahren (zentral fuer alle Altersregeln der Jugendkonten). Der Tag zaehlt in deutscher Zeit,
 * der Geburtstag gilt ab 00:00 Uhr. Gespeichert wird nie das Alter, nur das Geburtsdatum.
 */
export function ageOn(birthDate: string, today: string = berlinDate()): number {
  return ageOnShared(birthDate, today);
}

/** Darf fuer dieses Geburtsdatum ein Jugendkonto angelegt werden (mindestens 6, unter 16 Jahre, nicht in der Zukunft)? */
export function isYouthAge(birthDate: string, today: string = berlinDate()): boolean {
  if (birthDate > today || birthDate < "1900-01-01") return false;
  const age = ageOn(birthDate, today);
  return age >= YOUTH_AGE_MIN && age < YOUTH_AGE_LIMIT;
}

/** Ist der 16. Geburtstag erreicht (Jugendkonto ruht)? */
export function reached16(birthDate: string, today: string = berlinDate()): boolean {
  return graduationDate(birthDate) <= today;
}

/** Tage bis zum 16. Geburtstag (negativ = schon erreicht). Kalendertage ohne Zeitzonenfehler (UTC-Mitternacht). */
export function daysUntil16(birthDate: string, today: string = berlinDate()): number {
  const d = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((d(graduationDate(birthDate)) - d(today)) / 86_400_000);
}
