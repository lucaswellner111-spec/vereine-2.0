import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OfflineBanner } from "./offline-banner";

const setOnline = (v: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => v });

afterEach(() => setOnline(true));

describe("OfflineBanner", () => {
  it("zeigt den Hinweis nur offline und reagiert auf online/offline", () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.getByRole("status").textContent).toBe("");
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status").textContent).toMatch(/offline/);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("im Vollbild-Chat am Handy unter der Kopfzeile (Zurueck-Knopf bleibt frei)", () => {
    const { container } = render(<OfflineBanner immersive />);
    expect((container.firstElementChild as HTMLElement).className).toContain("max-md:pt-[calc(env(safe-area-inset-top)+4rem)]");
  });
});
