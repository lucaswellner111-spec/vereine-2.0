import type { FeedPost, FeedResponse } from "@vereine/shared";
import { describe, expect, it } from "vitest";
import { mergeFeed } from "./feed";

const post = (id: string, likes = 0) => ({ id, likes }) as unknown as FeedPost;
const page = (posts: FeedPost[], nextCursor: string | null = null, mode: "ranked" | "chrono" = "chrono"): FeedResponse => ({ mode, personalized: false, posts, nextCursor });

describe("mergeFeed", () => {
  it("setzt neue Beitraege oben ein, aktualisiert bekannte und behaelt nachgeladene Seiten samt Cursor", () => {
    const prev = page([post("b"), post("a")], "c2");
    const merged = mergeFeed(prev, page([post("c"), post("b", 5)], "c1"));
    expect(merged.posts.map((p) => p.id)).toEqual(["c", "b", "a"]);
    expect(merged.posts[1].likes).toBe(5);
    expect(merged.nextCursor).toBe("c2");
  });
  it("anderer Modus ersetzt komplett", () => {
    const next = page([post("x")], null, "ranked");
    expect(mergeFeed(page([post("a")]), next)).toBe(next);
  });
});
