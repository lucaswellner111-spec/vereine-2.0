import { describe, expect, it } from "vitest";
import { reasonFor, scorePost } from "./ranking";

describe("Ranking", () => {
  const base = { likes: 0, comments: 0, ageHours: 1 };

  it("neuere Beitraege schlagen aeltere bei gleicher Interaktion", () => {
    expect(scorePost({ ...base, relation: "follow", ageHours: 1 })).toBeGreaterThan(
      scorePost({ ...base, relation: "follow", ageHours: 48 }),
    );
  });

  it("Kommentare zaehlen mehr als Likes", () => {
    expect(scorePost({ ...base, relation: "follow", comments: 2 })).toBeGreaterThan(
      scorePost({ ...base, relation: "follow", likes: 2 }),
    );
  });

  it("Mitgliedschaft > Folgen > Entdecken", () => {
    const s = (relation: "member" | "follow" | "discover") => scorePost({ ...base, relation });
    expect(s("member")).toBeGreaterThan(s("follow"));
    expect(s("follow")).toBeGreaterThan(s("discover"));
  });

  it("erklaert den Grund fuer die Anzeige", () => {
    expect(reasonFor("follow", "TSV", 0, 0)).toBe("Du folgst TSV.");
    expect(reasonFor("member", "TSV", 0, 0)).toBe("Du bist Mitglied bei TSV.");
    expect(reasonFor("own", null, 0, 0)).toBe("Dein eigener Beitrag.");
    expect(reasonFor("discover", null, 4, 2)).toMatch(/Beliebt/);
  });
});
