import { describe, expect, it } from "vitest";
import { titleFromBody } from "./post-title";

describe("titleFromBody", () => {
  it("kuerzt auf 60 Zeichen, ohne Umbrueche, leer = null", () => {
    expect(titleFromBody("  Hallo\n\nWelt  ")).toBe("Hallo Welt");
    expect(titleFromBody("   ")).toBeNull();
    const t = titleFromBody("x".repeat(80))!;
    expect(t).toHaveLength(60);
    expect(t.endsWith("…")).toBe(true);
  });
});
