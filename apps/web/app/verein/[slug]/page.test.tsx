import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicOrg } from "@vereine/shared";
import PublicOrgPage, { generateMetadata } from "./page";

const org: PublicOrg = {
  slug: "tsv-offen",
  name: "TSV Offen",
  category: "Sport",
  city: "Musterstadt",
  tags: ["fussball"],
  logoId: "11111111-1111-1111-1111-111111111111",
  bannerId: "22222222-2222-2222-2222-222222222222",
  members: 12,
  about: "Wir spielen Fußball.",
  events: [{ title: "Sommerfest", kind: "party", startsAt: "2026-12-05T14:00:00.000Z", endsAt: null, location: "Sportplatz" }],
  posts: [{ body: "Neuer Trainingsplan", createdAt: "2026-11-01T10:00:00.000Z", tags: [] }],
};

const mockFetch = (status: number, body?: unknown) => {
  const fn = vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
};
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/verein/[slug] (oeffentliche Vereinsseite)", () => {
  it("rendert Vereinsdaten, oeffentliche Termine und Beitraege aus der oeffentlichen API", async () => {
    const fetchMock = mockFetch(200, org);
    render(await PublicOrgPage(params("tsv-offen")));
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/public/orgs/tsv-offen", expect.objectContaining({ cache: "no-store" }));
    expect(screen.getByRole("heading", { level: 1, name: "TSV Offen" })).toBeTruthy();
    expect(screen.getByText(/12 Mitglieder/)).toBeTruthy();
    expect(screen.getByText("Sommerfest")).toBeTruthy();
    expect(screen.getByText("Fest")).toBeTruthy();
    expect(screen.getByText("Neuer Trainingsplan")).toBeTruthy();
    // Bilder ueber den oeffentlichen Pfad, Anmelden fuehrt zurueck zur App-Seite des Vereins
    const imgs = Array.from(document.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(imgs).toContain(`/api/public/media/${org.bannerId}/banner`);
    expect(imgs).toContain(`/api/public/media/${org.logoId}/logo`);
    expect(imgs.some((s) => s?.startsWith("/api/media/"))).toBe(false);
    const cta = screen.getByRole("link", { name: "Mitglied werden" });
    expect(cta.getAttribute("href")).toBe(`/login?next=${encodeURIComponent("/vereine/tsv-offen")}`);
  });

  it("Metadaten: noindex ohne ALLOW_INDEXING, Titel und OG-Bild", async () => {
    mockFetch(200, org);
    const meta = await generateMetadata(params("tsv-offen"));
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.title).toBe("TSV Offen (Musterstadt)");
    expect(JSON.stringify(meta.openGraph)).toContain(`/api/public/media/${org.bannerId}/banner`);
  });

  it("404 der API bzw. ungueltige Adresse -> notFound", async () => {
    mockFetch(404);
    await expect(PublicOrgPage(params("gibt-es-nicht"))).rejects.toThrow();
    const fetchMock = mockFetch(200, org);
    await expect(PublicOrgPage(params("../admin"))).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("429 der API -> eigene Meldung statt Fehlerseite, noindex", async () => {
    mockFetch(429, { message: "Zu viele Anfragen." });
    render(await PublicOrgPage(params("tsv-offen")));
    expect(screen.getByText("Zu viele Anfragen, bitte kurz warten.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Erneut laden" }).getAttribute("href")).toBe("/verein/tsv-offen");
    const meta = await generateMetadata(params("tsv-offen"));
    expect(meta.robots).toEqual({ index: false, follow: false });
    // andere Fehler bleiben Fehler
    mockFetch(500);
    await expect(PublicOrgPage(params("tsv-offen"))).rejects.toThrow(/500/);
  });
});
