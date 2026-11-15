import { describe, expect, it } from "vitest";
import { safeNext } from "./next-url";

const q = (next: string) => `?next=${encodeURIComponent(next)}`;

describe("safeNext (kein Open Redirect)", () => {
  it("laesst interne Pfade durch", () => {
    expect(safeNext(q("/vereine/tsv?tab=termine"))).toBe("/vereine/tsv?tab=termine");
  });
  it.each(["//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "https://evil.example", "javascript:alert(1)", ""])(
    "lehnt %j ab",
    (next) => {
      expect(safeNext(q(next), "/feed")).toBe("/feed");
    },
  );
});
