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
