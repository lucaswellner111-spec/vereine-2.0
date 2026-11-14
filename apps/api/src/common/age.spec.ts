import { describe, expect, it } from "vitest";
import { ageOn, daysUntil16, graduationDate, isYouthAge, reached16 } from "./age";

describe("Altersberechnung (zentral)", () => {
  it("zaehlt volle Jahre; der Geburtstag gilt ab dem Tag selbst", () => {
    expect(ageOn("2011-06-15", "2026-06-14")).toBe(14);
    expect(ageOn("2011-06-15", "2026-06-15")).toBe(15);
    expect(ageOn("2010-06-15", "2026-06-14")).toBe(15);
    expect(ageOn("2010-06-15", "2026-06-15")).toBe(16);
  });

  it("Grenztage um den 16. Geburtstag", () => {
    expect(isYouthAge("2010-11-15", "2026-11-14")).toBe(true); // morgen 16
    expect(isYouthAge("2010-11-14", "2026-11-14")).toBe(false); // heute 16
    expect(reached16("2010-11-14", "2026-11-14")).toBe(true);
    expect(reached16("2010-11-15", "2026-11-14")).toBe(false);
    expect(daysUntil16("2010-11-15", "2026-11-14")).toBe(1);
    expect(daysUntil16("2010-12-14", "2026-11-14")).toBe(30);
    expect(daysUntil16("2010-11-13", "2026-11-14")).toBe(-1);
  });

  it("Untergrenze 6 Jahre, keine Zukunft, kein unplausibles Datum", () => {
    expect(isYouthAge("2020-11-14", "2026-11-14")).toBe(true); // genau 6
    expect(isYouthAge("2020-11-15", "2026-11-14")).toBe(false); // fast 6
    expect(isYouthAge("2027-01-01", "2026-11-14")).toBe(false);
    expect(isYouthAge("1800-01-01", "2026-11-14")).toBe(false);
  });

  it("Schaltjahr: 29.02. wird in Nicht-Schaltjahren am 01.03. 16", () => {
    expect(graduationDate("2008-02-29")).toBe("2024-02-29"); // 2024 ist ein Schaltjahr
    expect(graduationDate("2012-02-29")).toBe("2028-02-29");
    expect(graduationDate("2013-02-28")).toBe("2029-02-28");
    expect(graduationDate("2004-02-29")).toBe("2020-02-29");
    // 2100 waere kein Schaltjahr
    expect(graduationDate("2084-02-29")).toBe("2100-03-01");
    expect(ageOn("2012-02-29", "2027-02-28")).toBe(14);
    expect(ageOn("2012-02-29", "2027-03-01")).toBe(15);
  });
});
