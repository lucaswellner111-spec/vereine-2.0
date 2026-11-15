import { describe, expect, it } from "vitest";
import { buildIcsFeed, type IcsEvent } from "./ics";

/** Entfaltet gefaltete Zeilen (CRLF + Leerzeichen) wieder. */
const unfold = (s: string) => s.replace(/\r\n /g, "");

function events(n: number): IcsEvent[] {
  const base = Date.UTC(2027, 0, 1, 18, 0, 0);
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    title: i % 10 === 0 ? `Training, Halle A; Gruppe ${i}` : `Termin ${i} ${"sehr langer Titel äöü ".repeat(6)}`,
    description: i % 7 === 0 ? "Zeile 1\nZeile 2\r\nZeile 3, mit Komma; und Semikolon \\ Backslash" : "",
    location: i % 5 === 0 ? "Sporthalle, Hauptstr. 1; Eingang Nord" : "",
    startsAt: new Date(base + i * 86400_000),
    endsAt: i % 3 === 0 ? null : new Date(base + i * 86400_000 + 2 * 3600_000),
    canceled: i % 25 === 0,
    orgName: "TuS Beispiel",
    modifiedAt: new Date(base - 3600_000),
  }));
}

describe("buildIcsFeed mit vielen Terminen", () => {
  const N = 300;
  const out = buildIcsFeed(events(N));
  const lines = out.split("\r\n");

  it("ist ein gueltiger Kalender mit korrekter Terminanzahl", () => {
    expect(out.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(out.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(N);
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(N);
    const uids = unfold(out).match(/^UID:.*$/gm) ?? [];
    expect(uids).toHaveLength(N);
    expect(new Set(uids).size).toBe(N);
  });

  it("verwendet ausschliesslich CRLF", () => {
    expect(out.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("faltet jede Zeile auf hoechstens 75 Oktette", () => {
    for (const l of lines) expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75);
    expect(lines.some((l) => l.startsWith(" "))).toBe(true);
  });

  it("faltet nicht mitten in ein Mehrbyte-Zeichen", () => {
    const text = unfold(out);
    expect(text).not.toContain("�");
    expect(text).toContain("äöü");
  });

  it("maskiert Komma, Semikolon, Backslash und Zeilenumbrueche", () => {
    const text = unfold(out);
    expect(text).toContain("SUMMARY:Training\\, Halle A\\; Gruppe 0");
    expect(text).toContain("LOCATION:Sporthalle\\, Hauptstr. 1\\; Eingang Nord");
    expect(text).toContain("Zeile 1\\nZeile 2\\nZeile 3\\, mit Komma\\; und Semikolon \\\\ Backslash");
    for (const l of text.split("\r\n").filter((l) => /^(SUMMARY|LOCATION|DESCRIPTION):/.test(l))) {
      expect(l.replace(/^[A-Z]+:/, "").replace(/\\\\/g, "")).not.toMatch(/(?<!\\)[,;]/);
    }
  });

  it("setzt Status je Termin", () => {
    const text = unfold(out);
    expect(text.match(/^STATUS:CANCELLED$/gm)).toHaveLength(N / 25);
    expect(text.match(/^STATUS:CONFIRMED$/gm)).toHaveLength(N - N / 25);
  });
});
