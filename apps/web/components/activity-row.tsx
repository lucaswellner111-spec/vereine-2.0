"use client";

import clsx from "clsx";
import { Heart, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { MyCommentItem, MyLikeItem, NotificationItem } from "@vereine/shared";
import { mediaUrl } from "@/lib/media";
import { describeNotification, NOTIFICATION_ICONS, relativeTime } from "@/lib/notifications";
import { useSwipe } from "@/lib/use-swipe";
import { Button, UserAvatarLink } from "./ui";

/** Wischen nach links ab dieser Strecke (px) blendet die Zeile aus. */
export const HIDE_SWIPE = 90;

function Thumb({ mediaId }: { mediaId: string | null | undefined }) {
  if (!mediaId) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={mediaUrl(mediaId, "thumb")} alt="" aria-hidden loading="lazy" width={44} height={44} className="h-11 w-11 shrink-0 rounded-lg bg-surface-2 object-cover" />;
}

/**
 * Gemeinsames Zeilenggeruest: links Symbol/Avatar, Mitte Text (dehnbarer Link ueber die ganze Zeile), rechts Vorschaubild.
 * Avatar-Link und Knoepfe liegen ueber dem dehnbaren Link (z-10), damit nichts verschachtelt klickbar ist.
 */
function RowShell({
  href,
  lead,
  children,
  trailing,
  unread = false,
  onOpen,
  hideLabel,
  onHide,
}: {
  href: string;
  lead: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  unread?: boolean;
  onOpen?: () => void;
  hideLabel?: string;
  onHide?: () => void;
}) {
  const swipe = useSwipe({ axis: "x", threshold: HIDE_SWIPE, enabled: !!onHide, onSwipe: (dir) => dir === "left" && onHide?.() });
  const shift = Math.min(0, swipe.offset);
  return (
    <div className="group relative overflow-hidden">
      {onHide && (
        <div aria-hidden className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-danger text-sm font-semibold text-on-danger">
          Ausblenden
        </div>
      )}
      <div
        {...(onHide ? swipe.handlers : {})}
        style={{ transform: shift ? `translateX(${shift}px)` : undefined, touchAction: onHide ? "pan-y" : undefined }}
        className="relative flex items-center gap-3 bg-surface px-3 py-3 transition-colors hover:bg-surface-2"
      >
        <span className="relative z-10 shrink-0">{lead}</span>
        <div className="min-w-0 flex-1 text-sm">
          <Link
            href={href}
            onClick={(e) => {
              if (swipe.moved()) return e.preventDefault(); // Wischen ist kein Tippen
              onOpen?.();
            }}
            className={clsx("block break-words after:absolute after:inset-0 after:content-['']", unread ? "font-medium" : "text-muted")}
          >
            {children}
          </Link>
        </div>
        <span className="relative z-10 flex shrink-0 items-center gap-2">{trailing}</span>
        {unread && (
          <>
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />
            <span className="sr-only">(ungelesen)</span>
          </>
        )}
        {onHide && (
          // Handy: Wischen; Tastatur/Screenreader: dieser Knopf (auf dem Handy nur fuer Hilfstechnik sichtbar)
          <button
            type="button"
            onClick={onHide}
            aria-label={hideLabel ?? "Ausblenden"}
            title="Ausblenden"
            className="relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text focus-visible:opacity-100 max-md:sr-only max-md:focus-visible:not-sr-only md:opacity-0 md:group-hover:opacity-100"
          >
            <X size={15} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

/** Eine Benachrichtigung: verlinkter Avatar, Text, Zeit, Vorschaubild rechts, Punkt fuer ungelesen, Folgen-Knopf. */
export function ActivityRow({
  n,
  onOpen,
  onHide,
  onFollow,
  followBusy = false,
}: {
  n: NotificationItem;
  onOpen?: () => void;
  onHide?: () => void;
  /** Folgen-Knopf bei neuen Followern (Anfrage/Folgen umschalten). */
  onFollow?: (actorId: string, handle: string, current: "none" | "requested" | "following") => void;
  followBusy?: boolean;
}) {
  const { text, href } = describeNotification(n);
  const actor = n.actors?.[0];
  const Icon = NOTIFICATION_ICONS[n.type];
  const lead = actor ? (
    <UserAvatarLink handle={actor.handle} name={actor.name} mediaId={actor.avatarId} size={44} />
  ) : (
    <span aria-hidden className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-brand">
      <Icon size={20} />
    </span>
  );
  const followable = n.type === "new_follower" && actor?.handle && actor.following;
  return (
    <RowShell
      href={href}
      lead={lead}
      unread={!n.readAt}
      onOpen={onOpen}
      onHide={onHide}
      hideLabel={`Ausblenden: ${text}`}
      trailing={
        <>
          {followable && onFollow && (
            <Button
              size="sm"
              variant={actor.following === "none" ? "primary" : "secondary"}
              busy={followBusy}
              aria-pressed={actor.following !== "none"}
              onClick={() => onFollow(actor.id, actor.handle!, actor.following!)}
            >
              {actor.following === "none" ? "Folgen" : actor.following === "requested" ? "Angefragt" : "Gefolgt"}
            </Button>
          )}
          <Thumb mediaId={n.preview?.mediaId} />
        </>
      }
    >
      <span className="block">{text}</span>
      <time dateTime={n.createdAt} className="block text-xs font-normal text-muted">
        {relativeTime(n.createdAt)}
      </time>
    </RowShell>
  );
}

/** Zeile in "Gefällt mir" (eigene Likes). */
export function MyLikeRow({ item }: { item: MyLikeItem }) {
  return (
    <RowShell
      href={`/beitrag/${item.postId}`}
      lead={
        <span aria-hidden className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-like">
          <Heart size={20} className="fill-current" />
        </span>
      }
      trailing={<Thumb mediaId={item.post.mediaId} />}
    >
      <span className="block text-text">Du hast den Beitrag von {item.post.by} mit „Gefällt mir“ markiert.</span>
      {item.post.text && <span className="block truncate font-normal">{item.post.text}</span>}
      <time dateTime={item.at} className="block text-xs font-normal text-muted">
        {relativeTime(item.at)}
      </time>
    </RowShell>
  );
}

/** Zeile in "Kommentare" (eigene Kommentare und Antworten). */
export function MyCommentRow({ item }: { item: MyCommentItem }) {
  return (
    <RowShell
      href={`/beitrag/${item.post.id}`}
      lead={
        <span aria-hidden className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-brand">
          <MessageCircle size={20} />
        </span>
      }
      trailing={<Thumb mediaId={item.post.mediaId} />}
    >
      <span className="block break-words text-text">„{item.body}“</span>
      <span className="block truncate font-normal">Zum Beitrag von {item.post.by}</span>
      <time dateTime={item.at} className="block text-xs font-normal text-muted">
        {relativeTime(item.at)}
      </time>
    </RowShell>
  );
}
