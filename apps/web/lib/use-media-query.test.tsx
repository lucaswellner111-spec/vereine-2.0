import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsDesktop, useMediaQuery } from "./use-media-query";

const original = window.matchMedia;

afterEach(() => {
  cleanup();
  window.matchMedia = original;
});

function Probe({ query }: { query?: string }) {
  const value = query ? useMediaQuery(query) : useIsDesktop();
  return <p>{value ? "ja" : "nein"}</p>;
}

describe("useMediaQuery", () => {
  it("ohne matchMedia: false", () => {
    // jsdom kennt matchMedia nicht
    // @ts-expect-error bewusst entfernt
    window.matchMedia = undefined;
    render(<Probe query="(min-width: 768px)" />);
    expect(screen.getByText("nein")).toBeTruthy();
  });

  it("uebernimmt den Wert und reagiert auf change", () => {
    let listener: (() => void) | null = null;
    const mql = {
      matches: true,
      addEventListener: vi.fn((_: string, cb: () => void) => {
        listener = cb;
      }),
      removeEventListener: vi.fn(),
    };
    window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
    const { unmount } = render(<Probe />);
    expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 768px)");
    expect(screen.getByText("ja")).toBeTruthy();
    act(() => {
      mql.matches = false;
      listener?.();
    });
    expect(screen.getByText("nein")).toBeTruthy();
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalled();
  });
});
