import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PULL_THRESHOLD, usePullToRefresh } from "./use-pull-to-refresh";

vi.mock("./haptics", () => ({ haptic: vi.fn() }));

function touch(type: "touchstart" | "touchmove" | "touchend", y?: number, n = 1) {
  const e = new Event(type) as Event & { touches: { clientY: number }[] };
  e.touches = y === undefined ? [] : Array.from({ length: n }, () => ({ clientY: y }));
  window.dispatchEvent(e);
}
/** Zugweg wird um Faktor 0,5 gedaempft: Finger-Weg = 2 x Schwelle. */
const FULL = PULL_THRESHOLD * 2;

function pull(from: number, by: number) {
  act(() => {
    touch("touchstart", from);
    touch("touchmove", from + by);
    touch("touchend");
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 });
  document.body.style.overflow = "";
});
afterEach(() => {
  vi.useRealTimers();
});

describe("usePullToRefresh", () => {
  it("loest ab der Schwelle beim Loslassen genau einmal aus", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh(onRefresh));
    pull(0, FULL);
    await act(async () => {});
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("zu kurzes Ziehen loest nichts aus", async () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh(onRefresh));
    pull(0, FULL - 4);
    await act(async () => {});
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("mitten in der Seite (scrollY > 0) wird nicht ausgeloest", async () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh(onRefresh));
    window.scrollY = 300;
    pull(0, FULL * 2);
    await act(async () => {});
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("Seite waehrend der Geste weggescrollt: kein Ausloesen", async () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh(onRefresh));
    act(() => {
      touch("touchstart", 0);
      window.scrollY = 50;
      touch("touchmove", FULL * 2);
      touch("touchend");
    });
    await act(async () => {});
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("Mehrfinger-Geste und gesperrte Seite (Dialog) loesen nicht aus", async () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh(onRefresh));
    act(() => {
      touch("touchstart", 0, 2);
      touch("touchmove", FULL);
      touch("touchend");
    });
    document.body.style.overflow = "hidden";
    pull(0, FULL);
    await act(async () => {});
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("waehrend des Neuladens wird nicht doppelt ausgeloest, danach wieder moeglich", async () => {
    let finish!: () => void;
    const onRefresh = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const { result } = renderHook(() => usePullToRefresh(onRefresh));
    pull(0, FULL);
    await act(async () => {});
    expect(result.current.refreshing).toBe(true);
    pull(0, FULL);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    finish();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.refreshing).toBe(false);
    pull(0, FULL);
    await act(async () => {});
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("enabled=false: kein Ausloesen", async () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh(onRefresh, { enabled: false }));
    pull(0, FULL);
    await act(async () => {});
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("ein fehlschlagendes Neuladen blockiert den Hook nicht dauerhaft", async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error("x"));
    const { result } = renderHook(() => usePullToRefresh(onRefresh));
    pull(0, FULL);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.refreshing).toBe(false);
  });
});
