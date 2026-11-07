import type { FollowState, ProfileView } from "@vereine/shared";

/** Naechster Folgen-Zustand fuer die optimistische Anzeige; privat => Anfrage. Der Server bestaetigt danach. */
export function nextFollowState(current: FollowState, isPrivate: boolean): FollowState {
  if (current !== "none") return "none";
  return isPrivate ? "requested" : "following";
}

/** Optimistischer Folgen-Zustand eines Profils samt Follower-Zaehler. */
export function optimisticFollow(p: ProfileView): ProfileView {
  const next = nextFollowState(p.viewer.follow, p.visibility === "private");
  const delta = (next === "following" ? 1 : 0) - (p.viewer.follow === "following" ? 1 : 0);
  return { ...p, viewer: { ...p.viewer, follow: next }, counts: { ...p.counts, followers: Math.max(0, p.counts.followers + delta) } };
}
