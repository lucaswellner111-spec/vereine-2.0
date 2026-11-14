import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOUBLE_TAP_MS, useDoubleTap } from "./use-double-tap";

describe("useDoubleTap", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("einzelner Tipp wird um das Zeitfenster verzoegert", () => {
    const single = vi.fn();
    const double = vi.fn();
    const { result } = renderHook(() => useDoubleTap(single, double));
    act(() => result.current());
    expect(single).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(DOUBLE_TAP_MS + 1));
    expect(single).toHaveBeenCalledTimes(1);
    expect(double).not.toHaveBeenCalled();
  });

  it("zweiter Tipp im Fenster ersetzt den einzelnen", () => {
    const single = vi.fn();
    const double = vi.fn();
    const { result } = renderHook(() => useDoubleTap(single, double));
    act(() => result.current());
    act(() => void vi.advanceTimersByTime(100));
    act(() => result.current());
    act(() => void vi.advanceTimersByTime(1000));
    expect(double).toHaveBeenCalledTimes(1);
    expect(single).not.toHaveBeenCalled();
  });

  it("zwei Tipps weit auseinander sind zwei einzelne", () => {
    const single = vi.fn();
    const double = vi.fn();
    const { result } = renderHook(() => useDoubleTap(single, double));
    act(() => result.current());
    act(() => void vi.advanceTimersByTime(500));
    act(() => result.current());
    act(() => void vi.advanceTimersByTime(500));
    expect(single).toHaveBeenCalledTimes(2);
    expect(double).not.toHaveBeenCalled();
  });
});
