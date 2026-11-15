import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("@/lib/verwaltung", () => ({ useVerwaltung: () => ({ role: null }), itemsForRole: () => [] }));

import { CommandPalette, openCommandPalette } from "./command-palette";

type Deferred = { url: string; resolve: (v: unknown) => void; reject: (e: unknown) => void };
let calls: Deferred[] = [];

afterEach(cleanup);
beforeEach(() => {
  calls = [];
  apiMock.mockReset();
  apiMock.mockImplementation((url: string) => new Promise((resolve, reject) => calls.push({ url, resolve, reject })));
});

const org = (name: string, slug: string) => ({ slug, name, city: "Ort" });
const called = (url: string) => waitFor(() => expect(calls.some((c) => c.url === url)).toBe(true), { timeout: 2000 });
const call = (url: string) => calls.find((c) => c.url === url)!;

describe("CommandPalette: veraltete Suchantworten", () => {
  it("eine spaet eintreffende Antwort zur alten Eingabe ueberschreibt die neuere nicht", async () => {
    render(<CommandPalette />);
    act(() => openCommandPalette());
    const input = await screen.findByRole("combobox");

    fireEvent.change(input, { target: { value: "tu" } });
    await called("/orgs?q=tu");
    const oldOrgs = call("/orgs?q=tu");

    fireEvent.change(input, { target: { value: "tus" } });
    await called("/orgs?q=tus");

    await act(async () => call("/orgs?q=tus").resolve([org("TuS Neu", "tus-neu")]));
    expect(await screen.findByText("TuS Neu")).toBeTruthy();

    await act(async () => oldOrgs.resolve([org("Alt Verein", "alt")]));
    expect(screen.queryByText("Alt Verein")).toBeNull();
    expect(screen.getByText("TuS Neu")).toBeTruthy();
  });

  it("ein spaeter Fehler der alten Anfrage leert die neuen Treffer nicht", async () => {
    render(<CommandPalette />);
    act(() => openCommandPalette());
    const input = await screen.findByRole("combobox");

    fireEvent.change(input, { target: { value: "sv" } });
    await called("/orgs?q=sv");
    const oldOrgs = call("/orgs?q=sv");

    fireEvent.change(input, { target: { value: "sve" } });
    await called("/orgs?q=sve");
    await act(async () => call("/orgs?q=sve").resolve([org("SV Eiche", "sv-eiche")]));
    expect(await screen.findByText("SV Eiche")).toBeTruthy();

    await act(async () => oldOrgs.reject(new Error("offline")));
    expect(screen.getByText("SV Eiche")).toBeTruthy();
  });
});
