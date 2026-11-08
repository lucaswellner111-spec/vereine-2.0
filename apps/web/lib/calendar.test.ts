import { describe, expect, it } from "vitest";
import { berlinDayKey, berlinMidnight, currentMonth, gridRange, monthGrid, parseMonth, shiftMonth } from "./calendar";

describe("monthGrid (Mo-So)", () => {
  it("Monatsanfang an einem Sonntag: erste Woche beginnt am Montag davor", () => {
    const g = monthGrid("2026-11"); // 1.11.2026 ist ein Sonntag
    expect(g[0].map((d) => d.key)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(g[0].map((d) => d.inMonth)).toEqual([false, false, false, false, false, false, true]);
    expect(g).toHaveLength(6); // 1 + 30 Tage -> 6 Wochen
    expect(g[5][0].key).toBe("2026-11-30");
    expect(g[5][6].key).toBe("2026-12-06");
  });

  it("Monatsanfang am Montag ohne Vortage; Februar mit 4 Wochen", () => {
    expect(monthGrid("2027-02")[0][0].key).toBe("2027-02-01");
    expect(monthGrid("2027-02")).toHaveLength(4);
    expect(monthGrid("2026-06")[0][0].key).toBe("2026-06-01");
  });

  it("Zeitumstellung: Tage bleiben lueckenlos, Berliner Mitternacht korrekt", () => {
    const keys = monthGrid("2026-10").flat().map((d) => d.key);
    expect(keys).toContain("2026-10-25"); // Umstellung auf Winterzeit
    expect(new Set(keys).size).toBe(keys.length);
    expect(berlinMidnight("2026-10-24")).toBe("2026-10-23T22:00:00.000Z"); // Sommerzeit (UTC+2)
    expect(berlinMidnight("2026-10-25")).toBe("2026-10-24T22:00:00.000Z"); // Umstellung erst um 3 Uhr
    expect(berlinMidnight("2026-10-26")).toBe("2026-10-25T23:00:00.000Z"); // Winterzeit (UTC+1)
    expect(berlinMidnight("2026-03-29")).toBe("2026-03-28T23:00:00.000Z");
    expect(berlinMidnight("2026-03-30")).toBe("2026-03-29T22:00:00.000Z");
  });

  it("Termine werden dem Berliner Kalendertag zugeordnet", () => {
    expect(berlinDayKey("2026-10-25T22:30:00Z")).toBe("2026-10-25"); // 23:30 MEZ
    expect(berlinDayKey("2026-10-25T23:30:00Z")).toBe("2026-10-26");
    expect(berlinDayKey("2026-07-01T22:30:00Z")).toBe("2026-07-02"); // 00:30 MESZ
  });

  it("Zeitraum fuer die API umfasst hoechstens 42 Tage (plus Zeitumstellung)", () => {
    const r = gridRange(monthGrid("2026-11"));
    expect(r.from).toBe("2026-10-25T23:00:00.000Z");
    expect(r.to).toBe("2026-12-06T23:00:00.000Z");
    const days = (Date.parse(r.to) - Date.parse(r.from)) / 86400_000;
    expect(days).toBe(42);
    const oct = gridRange(monthGrid("2026-10")); // enthaelt die Umstellung: 1 h laenger
    expect(Date.parse(oct.to) - Date.parse(oct.from)).toBeLessThanOrEqual(42 * 86400_000 + 2 * 3600_000);
  });

  it("Monat aus der URL und Blaettern", () => {
    expect(parseMonth("2026-11")).toBe("2026-11");
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("kaputt")).toBeNull();
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(currentMonth(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11"); // Berlin ist schon im November
  });
});
