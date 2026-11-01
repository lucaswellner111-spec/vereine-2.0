"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationItem, NotificationsResponse } from "@vereine/shared";
import { api } from "@/lib/api";

// SKALIERUNG: Polling (30 s) ist fuer den Start in Ordnung. Mit dem Echtzeit-Chat (Phase 2)
// wird das durch einen WebSocket/SSE-Kanal mit Redis Pub/Sub ersetzt.
const POLL_MS = 30_000;

const fmt = (iso: string) => new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function describe(n: NotificationItem): { text: string; href: string } {
  const d = n.data;
  switch (n.type) {
    case "comment":
      return { text: `${d.commenter} hat kommentiert: „${d.excerpt}“`, href: "/feed" };
    case "membership_request":
      return { text: `Neuer Mitgliedsantrag bei ${d.orgName}`, href: "/verwaltung" };
    case "membership_decision":
      return {
        text: d.decision === "approve" ? `Du bist jetzt Mitglied bei ${d.orgName}.` : `Dein Antrag bei ${d.orgName} wurde abgelehnt.`,
        href: `/vereine/${d.orgSlug}`,
      };
    case "event_created":
      return { text: `Neuer Termin${d.series ? `serie (${d.series}×)` : ""} bei ${d.orgName}: ${d.title} (ab ${fmt(d.startsAt)})`, href: "/kalender" };
    case "event_reminder":
      return { text: `Erinnerung: ${d.title} – ${fmt(d.startsAt)}`, href: "/kalender" };
    case "event_canceled":
      return { text: d.series ? `Abgesagt: ${d.title} – ${d.series} Termine ab ${fmt(d.startsAt)}` : `Abgesagt: ${d.title} (${fmt(d.startsAt)})`, href: "/kalender" };
    case "new_follower":
      return { text: `${d.name} folgt dir jetzt.`, href: `/profil/${d.handle}` };
    case "follow_request":
      return { text: `${d.name} möchte dir folgen.`, href: "/einstellungen/profil" };
    case "follow_accepted":
      return { text: `${d.name} hat deine Folgeanfrage angenommen.`, href: `/profil/${d.handle}` };
    case "invoice_new":
      return { text: `Neue Rechnung ${d.number} von ${d.orgName}: ${d.amount}`, href: "/rechnungen" };
    case "invoice_overdue":
      return { text: `Rechnung ${d.number} von ${d.orgName} ist überfällig.`, href: "/rechnungen" };
    case "post_hidden":
      return { text: `Dein Beitrag „${d.excerpt}“ wurde ausgeblendet. Grund: ${d.reason}`, href: "/feed" };
  }
}

export function NotificationBell({ align = "right" }: { align?: "left" | "right" }) {
  const [data, setData] = useState<NotificationsResponse>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api<NotificationsResponse>("/notifications?limit=20").then(setData).catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function markAll() {
    await api("/notifications/read", { method: "POST", body: {} });
    load();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        aria-label={`Benachrichtigungen${data.unread ? `, ${data.unread} ungelesen` : ""}`}
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
      >
        <span aria-hidden>🔔</span>
        {data.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Benachrichtigungen" className={`absolute ${align === "left" ? "left-0" : "right-0"} z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface shadow-lg`}>
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-semibold">Benachrichtigungen</p>
            <button type="button" onClick={markAll} disabled={!data.unread} className="text-xs text-brand hover:underline disabled:opacity-40">
              Alle gelesen
            </button>
          </div>
          {data.items.length === 0 ? (
            <p className="p-4 text-sm text-muted">Keine Benachrichtigungen.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {data.items.map((n) => {
                const { text, href } = describe(n);
                return (
                  <li key={n.id}>
                    <Link href={href} onClick={() => setOpen(false)} className={`block px-3 py-2.5 text-sm hover:bg-surface-2 ${n.readAt ? "text-muted" : "font-medium"}`}>
                      {text}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
