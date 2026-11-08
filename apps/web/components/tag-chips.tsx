import clsx from "clsx";
import Link from "next/link";
import { tagLabel } from "@vereine/shared";

/** Ziel eines Tag-Links: Tag-Seite (/tags/fussball) oder gefilterte Liste (/feed?tag=fussball). */
export type TagTarget = "/tags" | "/feed" | "/vereine" | "/vereine-finden";
export function tagHref(to: TagTarget, tag: string): string {
  return to === "/tags" ? `/tags/${encodeURIComponent(tag)}` : `${to}?tag=${encodeURIComponent(tag)}`;
}

/**
 * Tags als kleine Chips. Mit `to` sind sie Links (Standard in der App: "/tags" -> /tags/fussball), ohne `to`
 * reiner Text (noetig innerhalb anderer Links, wo verschachtelte Links nicht erlaubt sind).
 */
export function TagChips({ tags, to, className }: { tags: string[]; to?: TagTarget; className?: string }) {
  if (tags.length === 0) return null;
  // Touch: hoeher (>= 24 px), statt unsichtbarer Trefferflaechen in der dichten Reihe
  const chip = "inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted pointer-coarse:py-1.5";
  return (
    <ul className={clsx("flex flex-wrap gap-2", className)} aria-label="Tags">
      {tags.map((t) => (
        <li key={t}>
          {to ? (
            <Link href={tagHref(to, t)} className={clsx(chip, "transition-colors hover:bg-brand/15 hover:text-brand")}>
              {tagLabel(t)}
            </Link>
          ) : (
            <span className={chip}>{tagLabel(t)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
