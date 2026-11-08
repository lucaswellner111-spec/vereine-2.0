import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePageTitle } from "./use-page-title";

describe("usePageTitle", () => {
  it("setzt den Titel mit Suffix, ignoriert null und folgt Aenderungen", () => {
    document.title = "Start";
    const { rerender, unmount } = renderHook(({ n }) => usePageTitle(n), { initialProps: { n: null as string | null } });
    expect(document.title).toBe("Start");
    rerender({ n: "Anna Beispiel" });
    expect(document.title).toBe("Anna Beispiel · Klubnest");
    rerender({ n: "TSV Musterstadt" });
    expect(document.title).toBe("TSV Musterstadt · Klubnest");
    unmount();
    // kein Zuruecksetzen beim Verlassen (Next uebernimmt beim Seitenwechsel)
    expect(document.title).toBe("TSV Musterstadt · Klubnest");
  });
});

describe("usePageTitle gegen spaete Metadaten", () => {
  it("setzt den Titel erneut, wenn Next ihn nachtraeglich ueberschreibt; nach dem Verlassen nicht mehr", async () => {
    const { unmount } = renderHook(() => usePageTitle("Mein Beitrag"));
    expect(document.title).toBe("Mein Beitrag · Klubnest");
    document.title = "Beitrag · Klubnest"; // wie metadata.title aus layout.tsx
    await new Promise((r) => setTimeout(r, 0)); // MutationObserver laeuft als Mikrotask
    expect(document.title).toBe("Mein Beitrag · Klubnest");
    unmount();
    document.title = "Feed · Klubnest";
    await new Promise((r) => setTimeout(r, 0));
    expect(document.title).toBe("Feed · Klubnest");
  });
});
