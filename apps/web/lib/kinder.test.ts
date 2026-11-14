import { describe, expect, it } from "vitest";
import { birthDateRange, inviteTokenFrom, orgSlugFrom } from "./kinder";

describe("Kinder-Helfer", () => {
  it("Geburtsdatum-Grenzen: nicht heute vor 16 Jahren (wuerde 16), nicht juenger als 6", () => {
    const r = birthDateRange(new Date(2026, 10, 14)); // 14.11.2026 (lokal)
    expect(r).toEqual({ min: "2010-11-15", max: "2020-11-14" });
  });

  it("Monatsende: Tag nach dem Geburtstag rollt in den naechsten Monat", () => {
    expect(birthDateRange(new Date(2026, 0, 31)).min).toBe("2010-02-01");
  });

  it("Einladungstoken aus Link oder nacktem Token; Unsinn bleibt leer", () => {
    const token = "A".repeat(43);
    expect(inviteTokenFrom(`https://klubnest.de/einladung/${token}`)).toBe(token);
    expect(inviteTokenFrom(`  ${token}  `)).toBe(token);
    expect(inviteTokenFrom("kaputt")).toBe("");
    expect(inviteTokenFrom("https://evil.example/x")).toBe("");
  });

  it("Vereinsadresse aus Link oder nackter Adresse", () => {
    expect(orgSlugFrom("https://klubnest.de/vereine/sv-test")).toBe("sv-test");
    expect(orgSlugFrom("SV-Test")).toBe("sv-test");
    expect(orgSlugFrom("sv test!")).toBe("");
  });
});
