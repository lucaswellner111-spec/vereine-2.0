"use client";

import clsx from "clsx";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { NotificationsResponse } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { describeNotification, NOTIFICATION_ICONS, relativeTime } from "@/lib/notifications";
import { useApi } from "@/lib/use-api";
import { Skeleton } from "./ui";
import { useEscapeLayer } from "./ui-client";
import { toast } from "./ui-hosts";

// SKALIERUNG: Polling (30 s, pausiert bei verstecktem Tab) reicht fuer den Start. Der Chat-Socket liefert
// bisher keine Benachrichtigungs-Ereignisse; spaeter ueber denselben Kanal (Redis Pub/Sub) live zustellen.
const POLL_MS = 30_000;

/** Liste fuer Glocke und Seite: Icon je Art, relative Zeit, ungelesen fett. */
export function NotificationRow({ n, onOpen }: { n: NotificationsResponse["items"][number]; onOpen?: () => void }) {
  const { text, href } = describeNotification(n);
  const Icon = NOTIFICATION_ICONS[n.type];
  return (
    <Link href={href} onClick={onOpen} className={clsx("flex items-start gap-3 px-3 py-2.5 text-sm hover:bg-surface-2", n.readAt ? "text-muted" : "font-medium")}>
      <Icon size={16} aria-hidden className={clsx("mt-0.5 shrink-0", n.readAt ? "text-muted" : "text-brand")} />
      <span className="min-w-0 flex-1">
        <span className="block break-words">{text}</span>
        <time dateTime={n.createdAt} className="block text-xs font-normal text-muted">{relativeTime(n.createdAt)}</time>
      </span>
      {!n.readAt && (
        <>
          <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
          <span className="sr-only">(ungelesen)</span>
        </>
      )}
    </Link>
  );
}

export function NotificationBell({ align = "right" }: { align?: "left" | "right" }) {
  // null = noch nicht geladen (Skeleton statt "Keine Benachrichtigungen")
  const state = useApi<NotificationsResponse>("/notifications?limit=20", { refreshOnFocus: true });
  const data = state.data;
  const refresh = state.refresh;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Polling nur bei sichtbarem Tab; Rueckkehr laedt ueber refreshOnFocus
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Escape ueber den gemeinsamen Stapel: schliesst nur, wenn das Popover die oberste Ebene ist
  useEscapeLayer(open, () => {
    setOpen(false);
    buttonRef.current?.focus();
  });

  /** Optimistisch: Zaehler sofort auf 0, bei Fehler alter Stand + Hinweis. */
  async function markAll() {
    const before = data;
    if (!before) return;
    const now = new Date().toISOString();
    state.setData({ ...before, unread: 0, items: before.items.map((n) => (n.readAt ? n : { ...n, readAt: now })) });
    try {
      await api("/notifications/read", { method: "POST", body: {} });
    } catch (e) {
      state.setData(before);
      toast.error(describeError(e));
    }
  }

  const unread = data?.unread ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) refresh();
        }}
        aria-label={`Benachrichtigungen${unread ? `, ${unread} ungelesen` : ""}`}
        aria-expanded={open}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg md:h-9 md:w-9 text-muted hover:bg-surface-2 hover:text-text"
      >
        <Bell size={18} aria-hidden />
        {unread > 0 && (
          <span aria-hidden className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold leading-none text-on-danger">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Benachrichtigungen"
          className={clsx(
            "absolute z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface shadow-lg",
            align === "left" ? "left-0" : "right-0",
            // Handy: volle Breite unter der Kopfleiste, damit nichts aus dem Bildschirm ragt
            "max-md:fixed max-md:inset-x-2 max-md:top-14 max-md:mt-0 max-md:w-auto max-md:max-w-none",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <p className="text-sm font-semibold">Benachrichtigungen</p>
            <button type="button" onClick={markAll} disabled={!unread} className="min-h-9 rounded-md px-2 text-xs text-brand hover:underline disabled:opacity-40">
              Alle gelesen
            </button>
          </div>
          {data === null ? (
            <div role="status" aria-label="Lade" className="space-y-3 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-4/5" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : data.items.length === 0 ? (
            <p className="p-4 text-sm text-muted">Keine Benachrichtigungen.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto overscroll-contain">
              {data.items.map((n) => (
                <li key={n.id}>
                  <NotificationRow n={n} onOpen={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border px-3 py-2 text-center">
            <Link href="/benachrichtigungen" onClick={() => setOpen(false)} className="inline-flex min-h-9 items-center text-sm font-medium text-brand hover:underline">
              Alle anzeigen
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
