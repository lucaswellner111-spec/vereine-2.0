import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AVV_DOCUMENT, type AvvStatus } from "@vereine/shared";
import { AvvAdmin, AvvBanner } from "./avv-admin";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const current = { version: AVV_DOCUMENT.version, textHash: "a".repeat(64), status: "draft" as const, title: AVV_DOCUMENT.title, publishedAt: AVV_DOCUMENT.publishedAt };
const open: AvvStatus = { required: true, current, accepted: null, upToDate: false, blocked: true, graceUntil: null, canAccept: true };
const done: AvvStatus = {
  ...open,
  accepted: { version: current.version, textHash: current.textHash, acceptedAt: "2026-11-13T10:30:00.000Z", acceptedBy: "Vera Vorstand", isCurrent: true },
  upToDate: true,
  blocked: false,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AvvAdmin", () => {
  it("zeigt Entwurfshinweis und Text, Zustimmen erst nach Haken, danach Nachweis mit Person und Datum", async () => {
    let state = open;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/avv/accept") && init?.method === "POST") {
        state = done;
        return json(done);
      }
      if (url.endsWith("/avv")) return json(state);
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AvvAdmin slug="sv" />);

    await screen.findByText(/Anwaltsprüfung ausstehend/);
    expect(screen.getByRole("region", { name: /Text des Vertrags/ }).textContent).toContain("Hetzner");
    expect(screen.getByRole("region", { name: /Text des Vertrags/ }).textContent).toContain("Scaleway");
    expect(screen.getByText("Noch nicht zugestimmt")).toBeTruthy();

    const button = screen.getByRole("button", { name: "Zustimmen" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Ich habe den Vertrag gelesen/));
    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByTestId("avv-proof").textContent).toMatch(/Vera Vorstand/));
    expect(screen.getByTestId("avv-proof").textContent).toMatch(/13\.11\.2026/);
    expect(screen.getByText("Zugestimmt")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Zustimmen" })).toBeNull();
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/accept"))!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ version: current.version, textHash: current.textHash, confirm: true });
    expect(screen.getByRole("link", { name: /Zugestimmten Text herunterladen/ }).getAttribute("href")).toBe("/api/orgs/sv/avv/document");
  }, 20_000);

  it("Kassenwart sieht den Stand, aber keinen Zustimmen-Knopf", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ...open, canAccept: false })));
    render(<AvvAdmin slug="sv" />);
    await screen.findByText(/Nur der Vorstand kann dem Vertrag zustimmen/);
    expect(screen.queryByRole("button", { name: "Zustimmen" })).toBeNull();
  });

  it("zeigt nach einer ausgetretenen Person den Hinweis auf das gelöschte Konto", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ...done, accepted: { ...done.accepted!, acceptedBy: null } })));
    render(<AvvAdmin slug="sv" />);
    await waitFor(() => expect(screen.getByTestId("avv-proof").textContent).toMatch(/gelöschten Konto/));
  });
});

describe("AvvBanner", () => {
  it("erscheint nur, wenn der Server erzwingt und die Zustimmung fehlt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(open)));
    const { unmount } = render(<AvvBanner slug="sv" />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/gesperrt/);
    expect(screen.getByRole("link", { name: /zustimmen/ }).getAttribute("href")).toBe("/verwaltung/vertrag");
    unmount();

    vi.stubGlobal("fetch", vi.fn(async () => json({ ...open, required: false, blocked: false })));
    const { container } = render(<AvvBanner slug="sv" />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
