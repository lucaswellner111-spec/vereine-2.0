import { describe, expect, it } from "vitest";
import { dayLabel, layoutMessages } from "./chat-groups";

const now = new Date(2026, 10, 10, 12, 0);
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();

describe("dayLabel", () => {
  it("Heute, Gestern, Datum", () => {
    expect(dayLabel(new Date(2026, 10, 10, 8), now)).toBe("Heute");
    expect(dayLabel(new Date(2026, 10, 9, 23), now)).toBe("Gestern");
    expect(dayLabel(new Date(2026, 10, 3, 9), now)).toMatch(/03\.11\./);
    expect(dayLabel(new Date(2025, 0, 2), now)).toBe("02.01.2025");
  });
});

describe("layoutMessages", () => {
  it("gruppiert Folgenachrichten derselben Person und setzt Tagestrenner", () => {
    const l = layoutMessages(
      [
        { senderId: "a", createdAt: at(9, 10) },
        { senderId: "a", createdAt: at(10, 9) },
        { senderId: "a", createdAt: at(10, 9, 2) },
        { senderId: "b", createdAt: at(10, 9, 3) },
        { senderId: "b", createdAt: at(10, 9, 30) },
      ],
      now,
    );
    expect(l.map((x) => x.day)).toEqual(["Gestern", "Heute", null, null, null]);
    expect(l.map((x) => [x.first, x.last])).toEqual([
      [true, true],
      [true, false],
      [false, true],
      [true, true],
      [true, true],
    ]);
  });
});
