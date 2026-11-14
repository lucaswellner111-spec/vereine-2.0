import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseWaitlistSource, WAITLIST_CHECK_INBOX, WAITLIST_CONSENT_TEXT, waitlistSignupSchema } from "@vereine/shared";
import { WaitlistForm } from "./waitlist-form";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("WaitlistForm", () => {
  it("Einwilligung ist nicht vorausgewaehlt und Pflicht; ohne sie kein Request", async () => {
    const fetchMock = vi.fn(async () => json({ message: WAITLIST_CHECK_INBOX }, 202));
    vi.stubGlobal("fetch", fetchMock);
    render(<WaitlistForm source="flyer" />);
    const consent = screen.getByRole("checkbox") as HTMLInputElement;
    expect(consent.checked).toBe(false);
    expect(screen.getByText(/Ich bin einverstanden/).textContent).toContain("widerrufen");
    fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: "lena@example.de" } });
    const button = screen.getByRole("button", { name: "Auf die Warteliste" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true); // erst nach der Mindestzeit aktiv
    await waitFor(() => expect(button.disabled).toBe(false), { timeout: 4000 });
    fireEvent.click(button);
    expect(await screen.findByText("Bitte bestätige die Einwilligung.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("schickt Rolle, Region, feste Quelle, Zeit seit Anzeige und leeren Honeypot; zeigt die neutrale Antwort", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ message: WAITLIST_CHECK_INBOX }, 202));
    vi.stubGlobal("fetch", fetchMock);
    render(<WaitlistForm source="flyer" />);
    vi.setSystemTime(new Date("2026-11-13T10:00:07Z")); // 7 s ausgefuellt
    fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: "lena@example.de" } });
    fireEvent.change(screen.getByLabelText("Deine Rolle (optional)"), { target: { value: "kasse" } });
    fireEvent.change(screen.getByLabelText("Region (optional)"), { target: { value: "lk-leipzig" } });
    fireEvent.click(screen.getByRole("checkbox"));
    const submit = screen.getByRole("button", { name: "Auf die Warteliste" }) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false), { timeout: 4000 });
    fireEvent.click(submit);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/waitlist$/);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ email: "lena@example.de", role: "kasse", region: "lk-leipzig", source: "flyer", consent: true });
    expect(body.website).toBeUndefined();
    expect(body.elapsedMs).toBeGreaterThanOrEqual(7000);
    expect(await screen.findByText(WAITLIST_CHECK_INBOX)).toBeTruthy();
  });

  it("Honeypot ist fuer Screenreader und Tastatur verborgen", () => {
    render(<WaitlistForm />);
    const trap = document.getElementById("wl-website") as HTMLInputElement;
    expect(trap.tabIndex).toBe(-1);
    expect(trap.closest("[aria-hidden]")).toBeTruthy();
  });
});

describe("Warteliste: gemeinsame Regeln", () => {
  it("Quelle nur aus festem Vokabular", () => {
    expect(parseWaitlistSource("flyer")).toBe("flyer");
    expect(parseWaitlistSource(" Flyer ")).toBe("flyer");
    expect(parseWaitlistSource("https://evil.example")).toBeUndefined();
    expect(parseWaitlistSource(undefined)).toBeUndefined();
    expect(waitlistSignupSchema.parse({ email: "A@b.de", source: "unbekannt", consent: true }).source).toBeUndefined();
  });

  it("Einwilligungstext nennt Zweck und Widerruf", () => {
    expect(WAITLIST_CONSENT_TEXT).toMatch(/E-Mail/);
    expect(WAITLIST_CONSENT_TEXT).toMatch(/widerrufen/);
  });
});
