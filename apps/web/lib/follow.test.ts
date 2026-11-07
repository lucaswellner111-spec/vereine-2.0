import type { ProfileView } from "@vereine/shared";
import { describe, expect, it } from "vitest";
import { nextFollowState, optimisticFollow } from "./follow";

const profile = (follow: ProfileView["viewer"]["follow"], visibility: "public" | "private", followers = 3) =>
  ({ visibility, counts: { posts: 0, followers, following: 0 }, viewer: { follow, isMe: false, canView: true } }) as unknown as ProfileView;

describe("Folgen optimistisch", () => {
  it("nextFollowState: oeffentlich folgen, privat anfragen, sonst entfolgen", () => {
    expect(nextFollowState("none", false)).toBe("following");
    expect(nextFollowState("none", true)).toBe("requested");
    expect(nextFollowState("following", false)).toBe("none");
    expect(nextFollowState("requested", true)).toBe("none");
  });
  it("optimisticFollow passt den Zaehler nur bei echtem Folgen an", () => {
    expect(optimisticFollow(profile("none", "public")).counts.followers).toBe(4);
    expect(optimisticFollow(profile("none", "private")).counts.followers).toBe(3);
    expect(optimisticFollow(profile("following", "public")).counts.followers).toBe(2);
    expect(optimisticFollow(profile("requested", "private")).viewer.follow).toBe("none");
  });
});
