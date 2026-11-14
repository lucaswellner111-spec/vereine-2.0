import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);
import type { NotificationItem } from "@vereine/shared";
import { BANNER_MS, bannerFromNotification, isConversationOpen, NotificationBanner, nextBanner, pushBanner, type BannerItem, type BannerState } from "./notification-hub";

const item = (key: string, text = "Text"): BannerItem => ({ key, title: "Titel", text, href: "/feed", avatar: null, thumbMediaId: null });

describe("Banner-Zustand", () => {
  it("hoechstens eins gleichzeitig, weitere werden gezaehlt und danach als Sammelzeile gezeigt", () => {
    let s: BannerState = { current: null, more: 0 };
    s = pushBanner(s, item("a"));
    s = pushBanner(s, item("b"));
    s = pushBanner(s, item("c"));
    expect(s.current?.key).toBe("a");
    expect(s.more).toBe(2);
    s = nextBanner(s);
    expect(s.current?.text).toBe("2 weitere Mitteilungen");
    expect(s.current?.href).toBe("/aktivitaet");
    expect(s.more).toBe(0);
    expect(nextBanner(s)).toEqual({ current: null, more: 0 });
  });

  it("dieselbe Meldung (z. B. gebuendelter Like) aktualisiert nur und zaehlt nicht doppelt", () => {
    let s = pushBanner({ current: null, more: 0 }, item("n:1:2", "alt"));
    s = pushBanner(s, item("n:1:2", "neu"));
    expect(s).toMatchObject({ current: { text: "neu" }, more: 0 });
  });
});

describe("bannerFromNotification", () => {
  it("nimmt Avatar der ersten Person, Titel nach Art und Vorschaubild", () => {
    const n: NotificationItem = {
      id: "1",
      type: "like",
      data: { postId: "p1" },
      readAt: null,
      createdAt: "2026-11-14T10:00:00Z",
      actors: [{ id: "u1", name: "Anna", handle: "anna", avatarId: "av1" }],
      count: 4,
      preview: { mediaId: "m1", text: null },
    };
    expect(bannerFromNotification(n)).toMatchObject({
      title: "Gefällt mir",
      text: "Anna und 3 weitere gefällt dein Beitrag.",
      href: "/beitrag/p1",
      avatar: { name: "Anna", mediaId: "av1" },
      thumbMediaId: "m1",
    });
  });
});

describe("isConversationOpen", () => {
  it("nur im Chat, mit gleicher Unterhaltung und sichtbarem Tab", () => {
    expect(isConversationOpen("c1", { pathname: "/chat", search: "?c=c1" }, true)).toBe(true);
    expect(isConversationOpen("c1", { pathname: "/chat", search: "?c=c2" }, true)).toBe(false);
    expect(isConversationOpen("c1", { pathname: "/feed", search: "?c=c1" }, true)).toBe(false);
    expect(isConversationOpen("c1", { pathname: "/chat", search: "?c=c1" }, false)).toBe(false);
  });
});

describe("NotificationBanner", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("zeigt Titel, Text und Link, schliesst nach 4 s", () => {
    const onNext = vi.fn();
    render(<NotificationBanner state={{ current: item("a", "Anna gefällt dein Beitrag."), more: 0 }} onNext={onNext} />);
    expect(screen.getByText("Anna gefällt dein Beitrag.")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/feed");
    act(() => void vi.advanceTimersByTime(BANNER_MS - 1));
    expect(onNext).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(2));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("pausiert bei Zeiger darueber und zeigt den Zaehler weiterer Meldungen", () => {
    const onNext = vi.fn();
    render(<NotificationBanner state={{ current: item("a"), more: 3 }} onNext={onNext} />);
    expect(screen.getByText("+3")).toBeTruthy();
    fireEvent.mouseEnter(screen.getByTestId("notification-banner"));
    act(() => void vi.advanceTimersByTime(10_000));
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.mouseLeave(screen.getByTestId("notification-banner"));
    act(() => void vi.advanceTimersByTime(BANNER_MS + 1));
    expect(onNext).toHaveBeenCalled();
  });

  it("Schliessen-Knopf und Wischen nach oben beenden das Banner, Antippen auch", () => {
    const onNext = vi.fn();
    render(<NotificationBanner state={{ current: item("a"), more: 0 }} onNext={onNext} />);
    fireEvent.click(screen.getByRole("button", { name: "Mitteilung schließen" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    const el = screen.getByTestId("notification-banner");
    const ptr = { pointerId: 1 };
    fireEvent.pointerDown(el, { ...ptr, clientY: 100 });
    fireEvent.pointerMove(el, { ...ptr, clientY: 70 });
    fireEvent.pointerUp(el, { ...ptr, clientY: 60 });
    expect(onNext).toHaveBeenCalledTimes(2);
    fireEvent.pointerDown(el, { ...ptr, clientY: 50 }); // neuer Tipp: kein Wischen mehr
    fireEvent.pointerUp(el, { ...ptr, clientY: 50 });
    fireEvent.click(screen.getByRole("link"));
    expect(onNext).toHaveBeenCalledTimes(3);
  });

  it("kurzes Wischen schliesst nicht; ohne Meldung bleibt nur der Live-Bereich", () => {
    const onNext = vi.fn();
    const { rerender } = render(<NotificationBanner state={{ current: item("a"), more: 0 }} onNext={onNext} />);
    const el = screen.getByTestId("notification-banner");
    fireEvent.pointerDown(el, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(el, { pointerId: 1, clientY: 90 });
    expect(onNext).not.toHaveBeenCalled();
    rerender(<NotificationBanner state={{ current: null, more: 0 }} onNext={onNext} />);
    expect(screen.queryByTestId("notification-banner")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("WCAG 2.2.1: per Tastatur erreichbar (Alt+M), Fokus pausiert die Anzeige, nach Verlassen laeuft sie weiter", () => {
    const onNext = vi.fn();
    render(<NotificationBanner state={{ current: item("a"), more: 0 }} onNext={onNext} />);
    act(() => void vi.advanceTimersByTime(BANNER_MS - 500));
    fireEvent.keyDown(window, { key: "m", altKey: true });
    expect(document.activeElement).toBe(screen.getByRole("link"));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.blur(screen.getByRole("link"));
    act(() => void vi.advanceTimersByTime(BANNER_MS + 1));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
