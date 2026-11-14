"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { ConversationSummary, NotificationItem, NotificationsResponse } from "@vereine/shared";
import { api } from "@/lib/api";
import { useChatEvents } from "@/lib/chat";
import { mediaUrl } from "@/lib/media";
import { actorsLabel, describeNotification, NOTIFICATION_TITLES } from "@/lib/notifications";
import { Avatar } from "./ui";

/** So lange bleibt ein Banner stehen (pausiert bei Zeiger/Fokus). */
export const BANNER_MS = 4000;
/** Wischen nach oben ab dieser Strecke (px) schliesst das Banner. */
const SWIPE_CLOSE = 36;

export type BannerItem = {
  key: string;
  title: string;
  text: string;
  href: string;
  avatar: { name: string; mediaId: string | null } | null;
  thumbMediaId: string | null;
};

/** Banner aus einer Benachrichtigung (reine Funktion, getestet). */
export function bannerFromNotification(n: NotificationItem): BannerItem {
  const { text, href } = describeNotification(n);
  const first = n.actors?.[0];
  return {
    key: `n:${n.id}:${n.count ?? 0}`,
    title: NOTIFICATION_TITLES[n.type] ?? (first ? actorsLabel(n.actors ?? [], n.count) : "Mitteilung"),
    text,
    href,
    avatar: first ? { name: first.name, mediaId: first.avatarId } : null,
    thumbMediaId: n.preview?.mediaId ?? null,
  };
}

/**
 * Anzeige-Zustand: hoechstens ein Banner gleichzeitig; weitere zaehlen hoch und erscheinen nach dem Schliessen
 * als eine Sammelzeile ("3 weitere Mitteilungen").
 */
export type BannerState = { current: BannerItem | null; more: number };
export function pushBanner(state: BannerState, item: BannerItem): BannerState {
  if (!state.current) return { current: item, more: 0 };
  if (state.current.key === item.key) return { current: item, more: state.more }; // gleiche Meldung aktualisiert sich nur
  return { current: state.current, more: state.more + 1 };
}
export function nextBanner(state: BannerState): BannerState {
  if (state.more === 0) return { current: null, more: 0 };
  return {
    current: {
      key: `more:${Date.now()}`,
      title: "Aktivität",
      text: state.more === 1 ? "1 weitere Mitteilung" : `${state.more} weitere Mitteilungen`,
      href: "/aktivitaet",
      avatar: null,
      thumbMediaId: null,
    },
    more: 0,
  };
}

type Hub = {
  /** Ungelesene Benachrichtigungen (ohne Chat); null = noch nicht geladen. */
  unread: number | null;
  /** Zaehlt bei jedem Live-Ereignis hoch: Listen laden daraufhin still neu. */
  version: number;
  /** Zaehler neu holen (nach Lesen/Ausblenden). */
  refresh: () => void;
};
const HubContext = createContext<Hub>({ unread: null, version: 0, refresh: () => undefined });
export const useNotificationHub = () => useContext(HubContext);

/** Ist die Unterhaltung gerade offen und sichtbar? Dann kein Banner dafuer. */
export function isConversationOpen(conversationId: string, loc: { pathname: string; search: string }, visible: boolean): boolean {
  if (!visible || !loc.pathname.startsWith("/chat")) return false;
  return new URLSearchParams(loc.search).get("c") === conversationId;
}

/**
 * Live-Benachrichtigungen ueber den vorhandenen Chat-Socket: Ereignis `notification` (nur die ID) -> Zaehler und Listen
 * aktualisieren, Banner zeigen. Polling uebernimmt nur der ChatProvider als Rueckfall (Ereignis "poll" bei getrenntem Socket).
 */
export function NotificationHubProvider({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const [banner, setBanner] = useState<BannerState>({ current: null, more: 0 });
  const seen = useRef(new Set<string>());

  const refresh = useCallback(() => {
    api<NotificationsResponse>("/notifications?limit=1")
      .then((r) => setUnread(r.unread))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const next = useCallback(() => setBanner(nextBanner), []);
  const show = useCallback((item: BannerItem) => {
    if (document.visibilityState !== "visible") return; // im Hintergrund uebernimmt Web-Push
    setBanner((s) => pushBanner(s, item));
  }, []);

  useChatEvents((e) => {
    if (e.type === "poll") {
      refresh();
      setVersion((v) => v + 1);
    } else if (e.type === "notification") {
      refresh();
      setVersion((v) => v + 1);
      api<NotificationItem>(`/notifications/${e.id}`)
        .then((n) => show(bannerFromNotification(n)))
        .catch(() => undefined);
    } else if (e.type === "message") {
      if (seen.current.has(e.messageId)) return;
      seen.current.add(e.messageId);
      if (seen.current.size > 200) seen.current.clear();
      // Im offenen Chat derselben Unterhaltung kein Banner; sonst Titel/Vorschau aus der Unterhaltungsliste
      const open = isConversationOpen(e.conversationId, { pathname: location.pathname, search: location.search }, document.visibilityState === "visible");
      if (open) return;
      api<ConversationSummary[]>("/chat/conversations")
        .then((list) => {
          const c = list.find((x) => x.id === e.conversationId);
          if (!c?.lastMessage || c.lastMessage.mine || c.unread === 0) return;
          show({
            key: `m:${e.messageId}`,
            title: c.title,
            text: c.lastMessage.preview,
            href: `/chat?c=${c.id}`,
            avatar: { name: c.title, mediaId: c.avatarId },
            thumbMediaId: null,
          });
        })
        .catch(() => undefined);
    }
  });

  const value = useMemo(() => ({ unread, version, refresh }), [unread, version, refresh]);
  return (
    <HubContext.Provider value={value}>
      {children}
      <NotificationBanner state={banner} onNext={next} />
    </HubContext.Provider>
  );
}

/** Banner im iOS-Stil oben am Bildschirm: Tippen oeffnet, nach oben wischen oder Schliessen-Knopf beendet, 4 s Anzeige. */
export function NotificationBanner({ state, onNext }: { state: BannerState; onNext: () => void }) {
  const { current, more } = state;
  const [paused, setPaused] = useState(false);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ y: number; id: number } | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!current || paused) return;
    const t = setTimeout(onNext, BANNER_MS);
    return () => clearTimeout(t);
  }, [current, paused, onNext]);

  const down = (e: PointerEvent<HTMLElement>) => {
    start.current = { y: e.clientY, id: e.pointerId };
    moved.current = false;
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const d = Math.min(0, e.clientY - s.y); // nur nach oben mitziehen
    if (Math.abs(d) > 6) moved.current = true;
    setDrag(d);
  };
  const up = (e: PointerEvent<HTMLElement>) => {
    const s = start.current;
    start.current = null;
    if (!s || s.id !== e.pointerId) return;
    const d = e.clientY - s.y;
    setDrag(0);
    if (d <= -SWIPE_CLOSE) onNext();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-3 pt-[max(env(safe-area-inset-top),0.5rem)]"
    >
      {current && (
        <div
          key={current.key}
          data-testid="notification-banner"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => {
            start.current = null;
            setDrag(0);
          }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          style={{ transform: drag ? `translateY(${drag}px)` : undefined, touchAction: "pan-x" }}
          className={clsx(
            "pointer-events-auto relative flex w-full max-w-md items-center gap-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-overlay backdrop-blur",
            "animate-banner",
          )}
        >
          {/* Dehnbarer Link ueber die ganze Flaeche; der Schliessen-Knopf liegt darueber */}
          <Link
            href={current.href}
            onClick={(e) => {
              if (moved.current) return e.preventDefault();
              onNext();
            }}
            className="flex min-w-0 flex-1 items-center gap-3 after:absolute after:inset-0 after:rounded-2xl after:content-['']"
          >
            {current.avatar && <Avatar name={current.avatar.name} mediaId={current.avatar.mediaId} size={40} />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{current.title}</span>
              <span className="line-clamp-2 break-words text-sm text-muted">{current.text}</span>
            </span>
            {current.thumbMediaId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(current.thumbMediaId, "thumb")} alt="" aria-hidden width={44} height={44} className="h-11 w-11 shrink-0 rounded-lg object-cover" />
            )}
          </Link>
          {more > 0 && <span className="relative shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">+{more}</span>}
          <button
            type="button"
            onClick={onNext}
            aria-label="Mitteilung schließen"
            className="hit-area relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
