import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PollView as Poll } from "@vereine/shared";
import { pollDraftToInput } from "./poll-composer";
import { pollDeadline, pollPercent, PollView } from "./poll-view";

const poll = (over: Partial<Poll> = {}): Poll => ({
  question: "Welcher Tag?",
  options: [
    { id: "a", label: "Samstag", votes: 3 },
    { id: "b", label: "Sonntag", votes: 1 },
  ],
  total: 4,
  myOptionId: null,
  closesAt: null,
  closed: false,
  ...over,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PollView", () => {
  it("vor der eigenen Stimme Auswahl ohne Ergebnis, danach Prozentbalken", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(poll({ myOptionId: "b", total: 5, options: [{ id: "a", label: "Samstag", votes: 3 }, { id: "b", label: "Sonntag", votes: 2 }] })), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PollView postId="p1" poll={poll()} />);
    expect(screen.queryByText("75 %")).toBeNull();
    expect(screen.getByText(/4 Stimmen · anonym/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sonntag" }));
    await waitFor(() => expect(screen.getByText("60 %")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/posts/p1/poll/vote", expect.objectContaining({ method: "PUT" }));
    expect(screen.getByRole("button", { name: /Sonntag: 40 Prozent, 2 Stimmen, deine Wahl/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stimme zurücknehmen" })).toBeTruthy();
  });

  it("beendete Umfrage zeigt Ergebnis, keine Abstimmung", () => {
    render(<PollView postId="p1" poll={poll({ closed: true, closesAt: "2026-11-01T10:00:00.000Z" })} />);
    expect(screen.getByText("75 %")).toBeTruthy();
    expect(screen.getByText(/Beendet/)).toBeTruthy();
    for (const b of screen.getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it("Hilfsfunktionen: Prozent, Frist", () => {
    expect(pollPercent(1, 3)).toBe(33);
    expect(pollPercent(0, 0)).toBe(0);
    expect(pollDeadline({ closed: false, closesAt: null })).toBeNull();
    expect(pollDeadline({ closed: false, closesAt: "2026-11-12T17:00:00.000Z" })).toBe("Endet am 12.11., 18:00");
  });
});

describe("Umfrage-Entwurf", () => {
  const now = new Date("2026-11-08T12:00:00");
  it("prueft Frage, Antworten, Duplikate und Frist wie die API", () => {
    expect(pollDraftToInput({ question: "Ja?", options: ["A", ""], closesOn: "" }, now)).toEqual({ error: "Mindestens zwei Antworten angeben." });
    expect(pollDraftToInput({ question: "Fr", options: ["A", "B"], closesOn: "" }, now)).toMatchObject({ error: expect.any(String) });
    expect(pollDraftToInput({ question: "Tag?", options: ["Ja", " ja"], closesOn: "" }, now)).toEqual({ error: "Antworten dürfen sich nicht wiederholen." });
    expect(pollDraftToInput({ question: "Tag?", options: ["A", "B"], closesOn: "2026-11-07" }, now)).toEqual({ error: "Das Ende muss in der Zukunft liegen." });
    expect(pollDraftToInput({ question: "Tag?", options: ["A", "B"], closesOn: "2027-03-01" }, now)).toMatchObject({ error: expect.stringContaining("90") });
    expect(pollDraftToInput({ question: " Tag? ", options: ["A", "", " B "], closesOn: "" }, now)).toEqual({ input: { question: "Tag?", options: ["A", "B"] } });
    const ok = pollDraftToInput({ question: "Tag?", options: ["A", "B"], closesOn: "2026-11-20" }, now);
    expect("input" in ok && ok.input.closesAt).toBe(new Date("2026-11-20T23:59:00").toISOString());
  });
});
