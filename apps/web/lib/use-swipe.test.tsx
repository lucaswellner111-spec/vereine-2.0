import { act, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { swipeDirection, useSwipe } from "./use-swipe";

const ev = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, pointerType: "touch", button: 0 }) as unknown as PointerEvent<HTMLElement>;

describe("swipeDirection", () => {
  it("erkennt Richtung ab Schwelle und nur auf der passenden Achse", () => {
    expect(swipeDirection(0, 90, 80, "y")).toBe("down");
    expect(swipeDirection(0, 70, 80, "y")).toBeNull();
    expect(swipeDirection(100, 90, 80, "y")).toBeNull(); // eher seitlich
    expect(swipeDirection(-60, 5, 50, "x")).toBe("left");
    expect(swipeDirection(60, 5, 50, "x")).toBe("right");
  });
});

describe("useSwipe", () => {
  it("meldet Wischen nach unten ab 80 px und zieht mit", () => {
    const onSwipe = vi.fn();
    const { result } = renderHook(() => useSwipe({ axis: "y", onSwipe }));
    act(() => result.current.handlers.onPointerDown(ev(10, 10)));
    act(() => result.current.handlers.onPointerMove(ev(10, 60)));
    expect(result.current.offset).toBe(50);
    act(() => result.current.handlers.onPointerUp(ev(10, 100)));
    expect(onSwipe).toHaveBeenCalledWith("down");
    expect(result.current.offset).toBe(0);
    expect(result.current.moved()).toBe(true);
  });
  it("kurze Bewegung loest nichts aus", () => {
    const onSwipe = vi.fn();
    const { result } = renderHook(() => useSwipe({ axis: "y", onSwipe }));
    act(() => result.current.handlers.onPointerDown(ev(10, 10)));
    act(() => result.current.handlers.onPointerUp(ev(10, 50)));
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
