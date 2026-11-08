import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePollWhile } from "./use-poll";

let hidden = false;

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePollWhile", () => {
  it("laedt alle 3 s nach und hoert auf, sobald der Lauf fertig ist", () => {
    const reload = vi.fn();
    const { rerender } = renderHook(({ active }) => usePollWhile(active, reload), { initialProps: { active: true } });
    act(() => void vi.advanceTimersByTime(9_000));
    expect(reload).toHaveBeenCalledTimes(3);
    rerender({ active: false }); // Status done
    act(() => void vi.advanceTimersByTime(60_000));
    expect(reload).toHaveBeenCalledTimes(3);
  });

  it("pausiert im Hintergrund-Tab und laedt beim Zurueckkehren sofort", () => {
    const reload = vi.fn();
    renderHook(() => usePollWhile(true, reload));
    hidden = true;
    act(() => void vi.advanceTimersByTime(30_000));
    expect(reload).not.toHaveBeenCalled();
    hidden = false;
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("wechselt nach 10 Minuten auf 30 s", () => {
    const reload = vi.fn();
    renderHook(() => usePollWhile(true, reload));
    act(() => void vi.advanceTimersByTime(10 * 60_000));
    const atTen = reload.mock.calls.length;
    expect(atTen).toBe(200);
    act(() => void vi.advanceTimersByTime(60_000));
    expect(reload.mock.calls.length - atTen).toBeLessThanOrEqual(3);
  });
});
