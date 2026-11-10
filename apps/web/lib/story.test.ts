import { describe, expect, it } from "vitest";
import { coverCrop, eventWhen, fitText, fitTextInBox, slugPart, storyFileName, truncateText, wrapLines, type Measure } from "./story";

// Einfaches Mass: jedes Zeichen ist fontSize/2 breit
const measure: Measure = (t, s) => t.length * (s / 2);

describe("Story-Kachel: Text", () => {
  it("kürzt an Wortgrenzen mit …", () => {
    expect(truncateText("  Hallo   Welt  ", 50)).toBe("Hallo Welt");
    expect(truncateText("Sommerfest am Sportplatz mit Grill", 20)).toBe("Sommerfest am…");
    expect(truncateText("abcdefghijklmnopqrstuvwxyz", 10)).toBe("abcdefghi…");
  });

  it("bricht Zeilen nach Breite um und markiert Überlauf", () => {
    // Breite 100 bei Schrift 10 -> 20 Zeichen je Zeile
    expect(wrapLines("eins zwei drei vier fünf sechs", 100, 10, measure, 5)).toEqual({ lines: ["eins zwei drei vier", "fünf sechs"], overflow: false });
    const r = wrapLines("eins zwei drei vier fünf sechs sieben acht neun zehn elf", 100, 10, measure, 2);
    expect(r.overflow).toBe(true);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[1].endsWith("…")).toBe(true);
    expect(r.lines.every((l) => measure(l, 10) <= 100)).toBe(true);
  });

  it("trennt überlange Wörter hart", () => {
    const r = wrapLines("https://example.invalid/sehr/langer/pfad", 100, 10, measure, 5);
    expect(r.lines.every((l) => measure(l, 10) <= 100)).toBe(true);
    expect(r.lines.length).toBeGreaterThan(1);
    expect(r.lines.map((l) => l.replace(/-$/, "")).join("")).toBe("https://example.invalid/sehr/langer/pfad");
  });

  it("wählt die größte passende Schrift", () => {
    expect(fitText("kurz", 100, [40, 20, 10], measure, 1).fontSize).toBe(40);
    expect(fitText("etwas längerer Titel", 100, [40, 20, 10], measure, 1).fontSize).toBe(10);
    const tooLong = fitText("a ".repeat(200), 100, [20, 10], measure, 2);
    expect(tooLong.fontSize).toBe(10);
    expect(tooLong.lines).toHaveLength(2);
  });
});

describe("Story-Kachel: Layout", () => {
  it("schneidet Bilder wie object-fit: cover zu", () => {
    expect(coverCrop(2000, 1000, 1000, 1000)).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 });
    expect(coverCrop(1000, 2000, 1000, 500)).toEqual({ sx: 0, sy: 750, sw: 1000, sh: 500 });
    expect(coverCrop(0, 0, 10, 10).sw).toBe(0);
  });

  it("formatiert Datum und Uhrzeit in Berliner Zeit", () => {
    const w = eventWhen("2026-07-11T16:00:00.000Z", "2026-07-11T20:00:00.000Z");
    expect(w.date).toContain("11. Juli");
    expect(w.time).toBe("18:00 – 22:00 Uhr");
    expect(eventWhen("2026-07-11T16:00:00.000Z", null).time).toBe("18:00 Uhr");
  });
});

describe("Story-Kachel: Dateiname", () => {
  it("ist sprechend und dateisystemsicher", () => {
    expect(slugPart("Größtes Sommerfest! 🎉 & Grillen")).toBe("groesstes-sommerfest-grillen");
    expect(storyFileName("termin", "Sommerfest", "2026-06-30T23:30:00.000Z")).toBe("klubnest-termin-sommerfest-2026-07-01.png");
    expect(storyFileName("beitrag", "")).toBe("klubnest-beitrag.png");
    expect(slugPart("x".repeat(80))).toHaveLength(40);
  });
});

describe("fitTextInBox", () => {
  it("waehlt die groesste Schrift, die in die Hoehe passt", () => {
    const r = fitTextInBox("eins zwei drei vier fuenf sechs", 200, 100, [40, 20], 1.2, measure);
    expect(r.overflow).toBe(false);
    expect(r.lines.length * r.fontSize * 1.2).toBeLessThanOrEqual(100);
  });
  it("kuerzt bei zu wenig Hoehe mit …", () => {
    const r = fitTextInBox("a ".repeat(200), 100, 30, [20], 1.2, measure);
    expect(r.overflow).toBe(true);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].endsWith("…")).toBe(true);
  });
});
