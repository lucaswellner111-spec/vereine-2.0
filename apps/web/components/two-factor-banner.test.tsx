import { describe, expect, it } from "vitest";
import { twoFactorBannerText } from "./two-factor-banner";

const base = { required: true, enabled: false, reason: "org-admin" as const, deadline: "2026-12-01T00:00:00.000Z", blocked: false };

describe("twoFactorBannerText", () => {
  it("kein Hinweis ohne Pflicht oder mit eingerichtetem Zwei-Faktor", () => {
    expect(twoFactorBannerText({ ...base, required: false, reason: null, deadline: null })).toBeNull();
    expect(twoFactorBannerText({ ...base, enabled: true, deadline: null })).toBeNull();
  });

  it("in der Uebergangsfrist: nennt das Fristende", () => {
    const text = twoFactorBannerText(base)!;
    expect(text).toMatch(/Bis 01\.12\.2026/);
    expect(text).not.toMatch(/gesperrt, bis/);
  });

  it("nach der Frist: sagt, was gesperrt ist", () => {
    expect(twoFactorBannerText({ ...base, blocked: true })).toMatch(/Mitgliederdaten, Rechnungen, Einladungen und Moderation sind gesperrt/);
  });
});
