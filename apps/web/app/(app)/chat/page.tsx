"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import type { ConversationSummary } from "@vereine/shared";
import { NewChat } from "@/components/chat/new-chat";
import { Thread } from "@/components/chat/thread";
import { Alert, Avatar, Badge, Button, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import { useChat, useChatEvents } from "@/lib/chat";

const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export default function ChatPage() {
  const { user } = useAuth();
  const { live } = useChat();
  const conversations = useApi<ConversationSummary[]>("/chat/conversations");
  const list = conversations.data;
  const load = conversations.reload;
  const [active, setActive] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useChatEvents(load);

  // Desktop: erste Unterhaltung direkt oeffnen; Mobil: erst die Liste zeigen.
  useEffect(() => {
    if (list && active === null && !creating && window.matchMedia("(min-width: 768px)").matches && list[0]) setActive(list[0].id);
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wurde die aktive Unterhaltung entfernt (z. B. Gruppe verlassen), zurueck zur Liste.
  useEffect(() => {
    if (list && active && !list.some((c) => c.id === active)) setActive(null);
  }, [list, active]);

  const showList = !active && !creating;

  return (
    <>
      <PageHeader
        title="Chat"
        subtitle={live ? "Verbunden – Nachrichten kommen sofort an." : "Nachrichten werden regelmäßig abgerufen."}
        action={<Button onClick={() => { setCreating(true); setActive(null); }}>Neuer Chat</Button>}
      />
      {conversations.error && list && <div className="mb-3"><Alert>{conversations.error}</Alert></div>}

      <div className="grid h-[calc(100dvh-14rem)] min-h-[26rem] overflow-hidden rounded-xl border border-border bg-surface md:grid-cols-[17rem_1fr]">
        <ul className={clsx("min-h-0 overflow-y-auto border-border md:block md:border-r", showList ? "block" : "hidden")} aria-label="Unterhaltungen">
          {list === null && conversations.error && (
            <li className="p-3">
              <ErrorState message={conversations.error} onRetry={load} />
            </li>
          )}
          {list === null && !conversations.error && (
            <li role="status" aria-label="Lade" className="space-y-3 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </li>
          )}
          {list?.length === 0 && (
            <li className="p-4 text-sm text-muted">
              Noch keine Unterhaltungen. Starte mit „Neuer Chat“ eine Nachricht an ein Vereinsmitglied oder den Vorstand.
            </li>
          )}
          {list?.map((c) => {
            const d = c.lastMessage ? new Date(c.lastMessage.createdAt) : null;
            return (
              <li key={c.id}>
                <button
                  onClick={() => { setActive(c.id); setCreating(false); }}
                  aria-current={c.id === active}
                  className={clsx("flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-2", c.id === active && "bg-surface-2")}
                >
                  <Avatar name={c.title} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.title}</span>
                      {d && <span className="shrink-0 text-xs text-muted">{sameDay(d, new Date()) ? timeFmt.format(d) : dayFmt.format(d)}</span>}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className={clsx("truncate text-xs", c.unread ? "font-medium text-text" : "text-muted")}>
                        {c.lastMessage ? `${c.lastMessage.mine ? "Du: " : ""}${c.lastMessage.preview}` : "Noch keine Nachricht"}
                      </span>
                      {c.unread > 0 && <Badge tone="brand">{c.unread}</Badge>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className={clsx("min-h-0 flex-col", showList ? "hidden md:flex" : "flex")}>
          {creating ? (
            <NewChat onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setActive(id); load(); }} />
          ) : active && user ? (
            <Thread key={active} id={active} me={user} onBack={() => setActive(null)} onChanged={load} />
          ) : (
            <p className="m-auto p-6 text-center text-sm text-muted">Wähle eine Unterhaltung oder starte einen neuen Chat.</p>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Nachrichten werden verschlüsselt gespeichert und nach der eingestellten Frist automatisch gelöscht. Keine Ende-zu-Ende-Verschlüsselung: gemeldete Nachrichten können geprüft werden.
      </p>
    </>
  );
}
