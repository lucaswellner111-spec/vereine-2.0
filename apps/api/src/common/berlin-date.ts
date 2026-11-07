const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });

/** Kalenderdatum in Deutschland (JJJJ-MM-TT), unabhaengig von der Zeitzone des Servers. */
export function berlinDate(d: Date = new Date()): string {
  return fmt.format(d);
}

/** Kalenderjahr in Deutschland. */
export function berlinYear(d: Date = new Date()): number {
  return Number(berlinDate(d).slice(0, 4));
}
