import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeeClassItem, FeeRunItem, FeeRunPreview } from "@vereine/shared";
import { FeeRunAdmin, feeRunDefaults } from "./fee-run-admin";
import { FeeClassesAdmin } from "./members-admin";

const classes: FeeClassItem[] = [
  { id: "c1", name: "Erwachsene", amountCents: 12000, interval: "yearly", description: "", members: 2 },
  { id: "c2", name: "Jugend", amountCents: 6000, interval: "yearly", description: "", members: 1 },
];
const preview: FeeRunPreview = {
  count: 2,
  totalCents: 18000,
  byClass: [
    { feeClassId: "c1", name: "Erwachsene", amountCents: 12000, members: 1, totalCents: 12000 },
    { feeClassId: "c2", name: "Jugend", amountCents: 6000, members: 1, totalCents: 6000 },
  ],
  withoutClass: 3,
  periodTaken: false,
};
const doneRun: FeeRunItem = { id: "r1", periodLabel: "2027", dueDate: "2027-01-31", feeClassIds: ["c1", "c2"], status: "done", createdCount: 2, skippedCount: 0, attempts: 1, createdAt: "2026-11-08T10:00:00.000Z", finishedAt: "2026-11-08T10:00:01.000Z" };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FeeRunAdmin", () => {
  it("Vorschau als Tabelle, Rueckfrage, dann Entwuerfe erzeugen; Liste zeigt Status", async () => {
    let runs: FeeRunItem[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/fee-classes")) return json(classes);
      if (url.endsWith("/fee-runs/preview")) return json(preview);
      if (url.endsWith("/fee-runs") && init?.method === "POST") {
        runs = [doneRun];
        return json(doneRun, 201);
      }
      if (url.endsWith("/fee-runs")) return json(runs);
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    render(<FeeRunAdmin slug="sv" />);

    await screen.findByText("Noch keine Beitragsläufe.");
    fireEvent.click(await screen.findByLabelText(/Erwachsene/));
    fireEvent.click(screen.getByLabelText(/Jugend/));
    fireEvent.click(screen.getByRole("button", { name: "Vorschau" }));
    await screen.findByText("2 Entwürfe");
    expect(screen.getByText(/3 aktive Mitglieder haben keine Beitragsklasse/)).toBeTruthy();
    const body = JSON.parse(String(fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/preview"))![1]!.body));
    expect(body).toMatchObject({ feeClassIds: ["c1", "c2"] });

    fireEvent.click(screen.getByRole("button", { name: "Entwürfe erzeugen" }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(String(confirm.mock.calls[0])).toMatch(/2 Rechnungsentwürfe/);
    await screen.findByText("fertig");
    expect(fetchMock).toHaveBeenCalledWith("/api/orgs/sv/fee-runs", expect.objectContaining({ method: "POST" }));
    expect(screen.queryByRole("button", { name: "Entwürfe erzeugen" })).toBeNull();
  });

  it("ohne Bestaetigung wird nichts erzeugt", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => (url.endsWith("/fee-classes") ? json(classes) : url.endsWith("/preview") ? json(preview) : json([])));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<FeeRunAdmin slug="sv" />);
    fireEvent.click(await screen.findByLabelText(/Erwachsene/));
    fireEvent.click(screen.getByRole("button", { name: "Vorschau" }));
    fireEvent.click(await screen.findByRole("button", { name: "Entwürfe erzeugen" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")).toHaveLength(1)); // nur Vorschau
  });
});

describe("FeeRunAdmin: Zustaende", () => {
  it("fehlgeschlagener Lauf: Erneut versuchen startet neu", async () => {
    let run: FeeRunItem = { ...doneRun, status: "failed", createdCount: 0, attempts: 5 };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/fee-classes")) return json(classes);
      if (url.endsWith("/retry")) {
        run = { ...doneRun, attempts: 1 };
        return json(run);
      }
      return json([run]);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<FeeRunAdmin slug="sv" />);
    await screen.findByText("fehlgeschlagen");
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await screen.findByText("fertig");
    expect(fetchMock).toHaveBeenCalledWith("/api/orgs/sv/fee-runs/r1/retry", expect.objectContaining({ method: "POST" }));
    expect(screen.queryByRole("button", { name: "Erneut versuchen" })).toBeNull();
  });

  it("vorhandener Zeitraum und 0-Euro-Klasse: Hinweise, Erzeugen gesperrt", async () => {
    const p: FeeRunPreview = { ...preview, periodTaken: true, byClass: [{ ...preview.byClass[0], amountCents: 0, totalCents: 0 }] };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith("/fee-classes") ? json(classes) : url.endsWith("/preview") ? json(p) : json([]))));
    render(<FeeRunAdmin slug="sv" />);
    fireEvent.click(await screen.findByLabelText(/Erwachsene/));
    fireEvent.click(screen.getByRole("button", { name: "Vorschau" }));
    await screen.findByText(/gibt es schon einen Beitragslauf/);
    expect(screen.getByText(/kostet 0 €/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Entwürfe erzeugen" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("geaenderte Beitragsklassen: neu laden und Vorschau verwerfen", async () => {
    let list = classes;
    const fetchMock = vi.fn(async (url: string) => (url.endsWith("/fee-classes") ? json(list) : url.endsWith("/preview") ? json(preview) : json([])));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<FeeRunAdmin slug="sv" classesVersion={0} />);
    fireEvent.click(await screen.findByLabelText(/Erwachsene/));
    fireEvent.click(screen.getByRole("button", { name: "Vorschau" }));
    await screen.findByText("2 Entwürfe");
    list = [{ ...classes[0], name: "Erwachsene neu" }, classes[1]];
    rerender(<FeeRunAdmin slug="sv" classesVersion={1} />);
    await screen.findByText(/Erwachsene neu/);
    expect(screen.queryByText("2 Entwürfe")).toBeNull();
  });

  it("Standard-Zeitraum: ab Oktober das Folgejahr", () => {
    expect(feeRunDefaults(new Date(2026, 8, 30)).periodLabel).toBe("2026");
    expect(feeRunDefaults(new Date(2026, 9, 1)).periodLabel).toBe("2027");
  });
});

describe("FeeClassesAdmin bearbeiten", () => {
  it("oeffnet den Dialog mit Werten und speichert per PUT", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT" ? json([{ ...classes[0], name: "Erwachsene neu", amountCents: 13050 }, classes[1]]) : json(classes),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onChanged = vi.fn();
    render(<FeeClassesAdmin slug="sv" canEdit onError={() => {}} onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole("button", { name: "Erwachsene bearbeiten" }));
    const amount = screen.getByLabelText("Betrag (€)", { selector: "#fce-amount" }) as HTMLInputElement;
    expect(amount.value).toBe("120,00");
    fireEvent.change(screen.getByLabelText("Name", { selector: "#fce-name" }), { target: { value: "Erwachsene neu" } });
    fireEvent.change(amount, { target: { value: "130,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByText("Erwachsene neu");
    expect(onChanged).toHaveBeenCalledTimes(1);
    const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PUT")!;
    expect(put[0]).toBe("/api/orgs/sv/fee-classes/c1");
    expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({ name: "Erwachsene neu", amountCents: 13050, interval: "yearly", description: "" });
  });

  it("ohne Vorstandsrecht kein Bearbeiten", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(classes)));
    render(<FeeClassesAdmin slug="sv" canEdit={false} onError={() => {}} />);
    await screen.findByText("Erwachsene");
    expect(screen.queryByRole("button", { name: /bearbeiten/ })).toBeNull();
  });
});
