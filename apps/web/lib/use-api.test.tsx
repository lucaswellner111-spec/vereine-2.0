import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FOCUS_REFRESH_MS, useApi, useBusy } from "./use-api";

type Pending = { url: string; signal?: AbortSignal; resolve: (body: unknown, status?: number) => void };

/** fetch-Attrappe: jede Anfrage bleibt offen, bis der Test sie beantwortet. Abbruch => AbortError. */
function stubFetch() {
  const calls: Pending[] = [];
  const fn = vi.fn((url: string, init?: RequestInit) => {
    return new Promise<Response>((res, rej) => {
      const signal = init?.signal ?? undefined;
      signal?.addEventListener("abort", () => rej(new DOMException("Abgebrochen", "AbortError")));
      calls.push({
        url,
        signal,
        resolve: (body, status = 200) =>
          res(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })),
      });
    });
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useApi", () => {
  it("verwirft veraltete Antworten nach Pfadwechsel", async () => {
    const { calls } = stubFetch();
    const { result, rerender } = renderHook(({ p }) => useApi<string>(p), { initialProps: { p: "/a" } });
    await waitFor(() => expect(calls.length).toBe(1));
    rerender({ p: "/b" });
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[0].signal?.aborted).toBe(true);
    await act(async () => calls[1].resolve("B"));
    await act(async () => calls[0].resolve("A")); // zu spaet
    expect(result.current.data).toBe("B");
    expect(calls[1].url).toBe("/api/b");
  });

  it("zeigt Abbrueche nie als Fehler", async () => {
    const { calls } = stubFetch();
    const { result, rerender } = renderHook(({ p }) => useApi<string>(p), { initialProps: { p: "/a" as string | null } });
    await waitFor(() => expect(calls.length).toBe(1));
    rerender({ p: null });
    await act(async () => {});
    expect(calls[0].signal?.aborted).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("setzt error bei Fehler; reload behaelt vorhandene Daten", async () => {
    const { calls } = stubFetch();
    const { result } = renderHook(() => useApi<string[]>("/liste"));
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => calls[0].resolve(["x"]));
    expect(result.current.data).toEqual(["x"]);

    act(() => result.current.reload());
    await waitFor(() => expect(calls.length).toBe(2));
    expect(result.current.data).toEqual(["x"]); // waehrend des Neuladens nicht geleert
    await act(async () => calls[1].resolve({ message: "Kaputt" }, 500));
    expect(result.current.error).toBe("Kaputt");
    expect(result.current.errorStatus).toBe(500);
    expect(result.current.data).toEqual(["x"]);
  });

  it("laedt nicht bei path null", async () => {
    const { fn } = stubFetch();
    const { result } = renderHook(() => useApi<string>(null));
    await act(async () => {});
    expect(fn).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it("wartet debounceMs und laedt nur den letzten Pfad", async () => {
    vi.useFakeTimers();
    const { calls } = stubFetch();
    const { rerender } = renderHook(({ p }) => useApi<string>(p, { debounceMs: 250, keepPrevious: true }), {
      initialProps: { p: "/q?x=a" },
    });
    await act(async () => vi.advanceTimersByTime(100));
    rerender({ p: "/q?x=ab" });
    await act(async () => vi.advanceTimersByTime(100));
    rerender({ p: "/q?x=abc" });
    await act(async () => vi.advanceTimersByTime(249));
    expect(calls.length).toBe(0);
    await act(async () => vi.advanceTimersByTime(1));
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("/api/q?x=abc");
  });
});

describe("useApi refreshOnFocus", () => {
  const setVisibility = (v: "visible" | "hidden") => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
  const returnToTab = () => {
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
  };

  it("laedt bei Rueckkehr still neu, hoechstens alle 30 s und ohne Skeleton", async () => {
    const now = vi.spyOn(Date, "now");
    let t = 1_000_000;
    now.mockImplementation(() => t);
    const { calls } = stubFetch();
    const { result } = renderHook(() => useApi<string>("/feed", { refreshOnFocus: true }));
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => calls[0].resolve("alt"));

    t += 10_000; // zu frueh
    act(() => returnToTab());
    expect(calls.length).toBe(1);

    t += FOCUS_REFRESH_MS;
    act(() => returnToTab());
    expect(calls.length).toBe(2);
    expect(result.current.loading).toBe(false); // still: kein Ladezustand
    expect(result.current.data).toBe("alt");
    await act(async () => calls[1].resolve("neu"));
    expect(result.current.data).toBe("neu");

    // wieder online zaehlt auch als Rueckkehr
    t += FOCUS_REFRESH_MS;
    act(() => window.dispatchEvent(new Event("online")));
    expect(calls.length).toBe(3);
    now.mockRestore();
    setVisibility("visible");
  });

  it("ohne Daten, ohne Option oder bei verstecktem Tab passiert nichts; Fehler bleiben still", async () => {
    const now = vi.spyOn(Date, "now");
    let t = 5_000_000;
    now.mockImplementation(() => t);
    const { calls } = stubFetch();
    const off = renderHook(() => useApi<string>("/a"));
    const on = renderHook(() => useApi<string>("/b", { refreshOnFocus: true }));
    await waitFor(() => expect(calls.length).toBe(2));
    t += FOCUS_REFRESH_MS * 2;
    act(() => returnToTab());
    expect(calls.length).toBe(2); // /b hat noch keine Daten, /a ohne Option

    await act(async () => calls[1].resolve("B"));
    t += FOCUS_REFRESH_MS;
    setVisibility("hidden");
    act(() => window.dispatchEvent(new Event("online")));
    expect(calls.length).toBe(2); // versteckt
    setVisibility("visible");
    act(() => window.dispatchEvent(new Event("online")));
    expect(calls.length).toBe(3);
    await act(async () => calls[2].resolve({ message: "Kaputt" }, 500));
    expect(on.result.current.error).toBeNull();
    expect(on.result.current.data).toBe("B");
    off.unmount();
    now.mockRestore();
  });

  it("merge fuehrt stille Aktualisierung mit vorhandenen Daten zusammen", async () => {
    const { calls } = stubFetch();
    const { result } = renderHook(() =>
      useApi<number[]>("/liste", { merge: (prev, next) => [...next.filter((n) => !prev.includes(n)), ...prev] }),
    );
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => calls[0].resolve([2, 1]));
    act(() => result.current.refresh());
    await act(async () => calls[1].resolve([3, 2]));
    expect(result.current.data).toEqual([3, 2, 1]);
  });

  it("refresh verwirft die Antwort, wenn waehrenddessen lokal geaendert wurde", async () => {
    const { calls } = stubFetch();
    const { result } = renderHook(() => useApi<string>("/zustand"));
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => calls[0].resolve("alt"));
    act(() => result.current.refresh());
    act(() => result.current.setData("optimistisch"));
    await act(async () => calls[1].resolve("server-vorher"));
    expect(result.current.data).toBe("optimistisch");
    // ohne lokale Aenderung gilt die Antwort wieder
    act(() => result.current.refresh());
    await act(async () => calls[2].resolve("server-neu"));
    expect(result.current.data).toBe("server-neu");
  });
});

describe("useBusy", () => {
  it("blockiert einen zweiten Aufruf, solange der erste laeuft", async () => {
    const { result } = renderHook(() => useBusy());
    let finish!: () => void;
    const first = vi.fn(() => new Promise<string>((r) => (finish = () => r("eins"))));
    const second = vi.fn(async () => "zwei");

    let p1!: Promise<string | undefined>;
    act(() => {
      p1 = result.current[1](first);
    });
    expect(result.current[0]).toBe(true);
    let r2: string | undefined = "x";
    await act(async () => {
      r2 = await result.current[1](second);
    });
    expect(second).not.toHaveBeenCalled();
    expect(r2).toBeUndefined();
    await act(async () => finish());
    await expect(p1).resolves.toBe("eins");
    expect(result.current[0]).toBe(false);
  });
});
