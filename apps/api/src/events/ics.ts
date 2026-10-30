/** Minimaler iCalendar-Export (RFC 5545) fuer einzelne Termine. */

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Zeilen laenger als 75 Oktette werden gefaltet (Fortsetzung mit fuehrendem Leerzeichen). */
function fold(line: string): string {
  const out: string[] = [];
  let buf = "";
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > 74) {
      out.push(buf);
      buf = " ";
      bytes = 1;
    }
    buf += ch;
    bytes += n;
  }
  out.push(buf);
  return out.join("\r\n");
}

export function buildIcs(e: {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date | null;
  canceled: boolean;
  orgName: string;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vereine 2.0//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@vereine`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(e.startsAt)}`,
    `DTEND:${utc(e.endsAt ?? new Date(e.startsAt.getTime() + 2 * 3600_000))}`,
    `SUMMARY:${esc(e.title)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    `DESCRIPTION:${esc([e.orgName, e.description].filter(Boolean).join(" – "))}`,
    `STATUS:${e.canceled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
