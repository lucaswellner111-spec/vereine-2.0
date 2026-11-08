/**
 * Monatsraster des Kalenders (Mo-So, Europe/Berlin). Tage sind reine Kalenderdaten ("2026-11-02"); erst fuer die
 * API-Abfrage werden sie in Berliner Mitternacht (UTC-Zeitpunkt) umgerechnet. So stoert die Zeitumstellung nicht.
 */

export const TZ = "Europe/Berlin";
export type MonthKey = string; // "2026-11"
export type DayKey = string; // "2026-11-02"
export type GridDay = { key: DayKey; day: number; inMonth: boolean };

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const monthFmt = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

/** Kalendertag eines Zeitpunkts in Berlin. */
export function berlinDayKey(at: string | Date): DayKey {
  return dayFmt.format(new Date(at)); // en-CA: YYYY-MM-DD
}

/** Aktueller Monat in Berlin. */
export function currentMonth(now: Date = new Date()): MonthKey {
  return berlinDayKey(now).slice(0, 7);
}

/** Gueltiger Monat aus der URL, sonst null. */
export function parseMonth(raw: string | null | undefined): MonthKey | null {
  return raw && MONTH_RE.test(raw) ? raw : null;
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function monthLabel(month: MonthKey): string {
  const [y, m] = month.split("-").map(Number);
  return monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Wochen des Monats, jeweils Montag bis Sonntag, inkl. Randtage der Nachbarmonate (4-6 Wochen). */
export function monthGrid(month: MonthKey): GridDay[][] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Montag = 0
  const start = new Date(Date.UTC(y, m - 1, 1 - offset));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start.getTime() + (w * 7 + i) * 86400_000);
      return { key: keyOf(d), day: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1 };
    }),
  );
}

/** Verschiebung Berlin gegenueber UTC (ms) zum Zeitpunkt t. */
function berlinOffset(t: number): number {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** Berliner Mitternacht eines Kalendertags als UTC-Zeitpunkt (ISO). */
export function berlinMidnight(day: DayKey): string {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - berlinOffset(guess);
  t = guess - berlinOffset(t); // zweiter Schritt fuer Tage mit Zeitumstellung
  return new Date(t).toISOString();
}

/** Zeitraum fuer die API: Mitternacht des ersten bis Mitternacht nach dem letzten Rastertag. */
export function gridRange(grid: GridDay[][]): { from: string; to: string } {
  const first = grid[0][0].key;
  const lastKey = grid[grid.length - 1][6].key;
  const [y, m, d] = lastKey.split("-").map(Number);
  return { from: berlinMidnight(first), to: berlinMidnight(keyOf(new Date(Date.UTC(y, m - 1, d + 1)))) };
}
