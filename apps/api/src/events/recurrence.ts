/**
 * Terminserien: Wiederholungen werden beim Anlegen als einzelne Termine erzeugt (gemeinsame series_id).
 * So bleiben Zu-/Absagen, Erinnerungen und Absagen je Termin einfach; es braucht keine RRULE-Engine.
 * Die Uhrzeit bleibt in der Ortszeit (Europe/Berlin) stabil, auch ueber Sommer-/Winterzeit hinweg.
 */
const TZ = "Europe/Berlin";
const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type Wall = { y: number; m: number; d: number; h: number; mi: number };

function wall(date: Date): Wall {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute };
}

/** Versatz der Zeitzone zu UTC in Millisekunden fuer einen Zeitpunkt. */
function offsetMs(date: Date): number {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

function wallToUtc(w: Wall): Date {
  const guess = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi);
  const first = guess - offsetMs(new Date(guess));
  return new Date(guess - offsetMs(new Date(first)));
}

export type Repeat = { freq: "weekly" | "biweekly" | "monthly"; count: number };

/** Alle Beginnzeiten der Serie (inklusive des ersten Termins). */
export function occurrences(start: Date, repeat: Repeat): Date[] {
  const base = wall(start);
  const out: Date[] = [];
  for (let i = 0; i < repeat.count; i++) {
    let y = base.y;
    let m = base.m;
    let d = base.d;
    if (repeat.freq === "monthly") {
      const idx = base.m - 1 + i;
      y = base.y + Math.floor(idx / 12);
      m = (idx % 12) + 1;
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      d = Math.min(base.d, last); // 31. Januar -> 28./29. Februar
    } else {
      const shifted = new Date(Date.UTC(base.y, base.m - 1, base.d + (repeat.freq === "weekly" ? 7 : 14) * i));
      y = shifted.getUTCFullYear();
      m = shifted.getUTCMonth() + 1;
      d = shifted.getUTCDate();
    }
    out.push(wallToUtc({ y, m, d, h: base.h, mi: base.mi }));
  }
  return out;
}
