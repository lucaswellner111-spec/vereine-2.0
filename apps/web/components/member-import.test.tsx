import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberImportPreview, MemberImportResult, PendingMemberPage } from "@vereine/shared";
import { MemberImport } from "./member-import";
import { UiHosts } from "./ui-hosts";

const preview: MemberImportPreview = {
  delimiter: ";",
  columns: [
    { field: "firstName", header: "Vorname" },
    { field: "lastName", header: "Nachname" },
    { field: "email", header: "E-Mail" },
  ],
  ignoredColumns: ["Telefon"],
  total: 3,
  valid: 1,
  errors: 1,
  duplicates: 1,
  mail: { today: 1, later: 0 },
  rows: [
    { line: 2, firstName: "Lena", lastName: "Müller", email: "lena@example.de", memberNo: null, joinedOn: null, feeClassName: null, status: "ok", problems: [] },
    { line: 3, firstName: "=HYPERLINK(1)", lastName: "Böse", email: "böse", memberNo: null, joinedOn: null, feeClassName: null, status: "error", problems: ["Vorname darf nicht mit = + - oder @ beginnen."] },
    { line: 4, firstName: "Ina", lastName: "Doppelt", email: "lena@example.de", memberNo: null, joinedOn: null, feeClassName: null, status: "duplicate", problems: ["E-Mail steht schon in Zeile 2."] },
  ],
};
const result: MemberImportResult = { imported: 1, skipped: 2, mailToday: 1, mailLater: 0 };
const empty: PendingMemberPage = { total: 0, items: [] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function pickFile() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File(["Vorname;Nachname;E-Mail\nLena;Müller;lena@example.de"], "mitglieder.csv", { type: "text/csv" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("MemberImport", () => {
  it("zeigt den Erwartungs-Hinweis, die Vorschau (Fehler/Dublette, Formelzelle nur als Text) und erst nach Bestaetigung den Import samt Ergebnis", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/member-imports/preview")) return json(preview);
      if (url.endsWith("/member-imports") && init?.method === "POST") return json(result, 201);
      return json(empty);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <>
        <MemberImport slug="sv" />
        <UiHosts />
      </>,
    );
    expect(screen.getByText(/Dein Verein ist verantwortlich/)).toBeTruthy();
    expect(screen.queryByText(/lit\. f/)).toBeNull();
    const status = screen.getByTestId("import-result"); // immer im DOM, Ergebnis wird vorgelesen
    expect(status.textContent).toBe("");

    pickFile();
    await screen.findByText("Vorschau");
    expect(screen.getByText("1 gültig")).toBeTruthy();
    expect(screen.getByText("1 Dublette")).toBeTruthy();
    // Formel-Zelle erscheint als reiner Text mit Fehlermeldung, nicht als Markup/Link
    expect(screen.getByText(/=HYPERLINK\(1\)/).tagName).toBe("TD");
    expect(screen.getByText("Vorname darf nicht mit = + - oder @ beginnen.")).toBeTruthy();
    expect(screen.getByText(/nicht übernommen: Telefon/)).toBeTruthy();
    // Vorschau speichert nichts: nur ein POST an /preview
    expect(calls.filter((c) => c.startsWith("POST"))).toEqual(["POST /api/orgs/sv/member-imports/preview"]);

    const go = screen.getByRole("button", { name: "1 Person einladen" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true); // erst nach Bestaetigung "informiert"
    fireEvent.click(screen.getByRole("checkbox", { name: /Ich habe die Personen informiert/ }));
    fireEvent.click(go);
    fireEvent.click(await screen.findByRole("button", { name: "Einladungen verschicken" }));
    await screen.findByText("Ergebnis des Imports");
    expect(screen.getByText(/2 Zeilen wurden nicht übernommen/)).toBeTruthy();
    expect(screen.getByText("1 Person vorgemerkt und eingeladen.")).toBeTruthy();
    expect(status.contains(screen.getByRole("heading", { name: "Ergebnis des Imports" }))).toBe(true);
    expect(calls.filter((c) => c.startsWith("POST"))).toEqual(["POST /api/orgs/sv/member-imports/preview", "POST /api/orgs/sv/member-imports"]);
  });

  it("Rest folgt an spaeteren Tagen: Text 'vorgemerkt', Schliessen entfernt das Ergebnis", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        url.endsWith("/preview") ? json({ ...preview, mail: { today: 0, later: 1 } }) : url.endsWith("/member-imports") && init?.method === "POST" ? json({ imported: 1, skipped: 0, mailToday: 0, mailLater: 1 }, 201) : json(empty),
      ),
    );
    render(
      <>
        <MemberImport slug="sv" />
        <UiHosts />
      </>,
    );
    pickFile();
    await screen.findByText("Vorschau");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "1 Person einladen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Einladungen verschicken" }));
    await screen.findByText("1 Person vorgemerkt.");
    expect(screen.queryByText(/vorgemerkt und eingeladen/)).toBeNull();
    expect(screen.getByText(/1 Einladung folgt automatisch/)).toBeTruthy();
    fireEvent.click(within(screen.getByTestId("import-result")).getByRole("button", { name: "Schließen" }));
    expect(screen.queryByText("Ergebnis des Imports")).toBeNull();
  });

  it("Limit-Fehler der API (429) wird als Hinweis angezeigt, keine Vorschau", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.endsWith("/preview") ? json({ message: "Du hast das Limit für Import-Prüfungen erreicht. Bitte versuche es später erneut." }, 429) : json(empty))),
    );
    render(<MemberImport slug="sv" />);
    pickFile();
    await waitFor(() => expect(screen.getByText(/Limit für Import-Prüfungen/)).toBeTruthy());
    expect(screen.queryByText("Vorschau")).toBeNull();
  });
});
