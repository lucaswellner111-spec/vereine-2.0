import type { FeedResponse } from "@vereine/shared";

/** Stille Aktualisierung (Rueckkehr zum Tab): neue Beitraege oben, bekannte aktualisieren, nachgeladene Seiten behalten. */
export function mergeFeed(prev: FeedResponse, next: FeedResponse): FeedResponse {
  if (prev.mode !== next.mode) return next;
  const known = new Set(prev.posts.map((p) => p.id));
  const fresh = new Map(next.posts.map((p) => [p.id, p]));
  return {
    ...prev,
    personalized: next.personalized,
    posts: [...next.posts.filter((p) => !known.has(p.id)), ...prev.posts.map((p) => fresh.get(p.id) ?? p)],
  };
}
