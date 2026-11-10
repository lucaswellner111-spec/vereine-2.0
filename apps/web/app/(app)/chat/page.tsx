"use client";

import clsx from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef } from "react";
import type { ConversationSummary } from "@vereine/shared";
import { LazyNewChat as NewChat } from "@/components/lazy";
import { Thread } from "@/components/chat/thread";
import { MessageSquare } from "lucide-react";
import { Alert, Avatar, Badge, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { LargeTitleHeader, lockScroll, PullIndicator } from "@/components/ui-client";
import { useApi } from "@/lib/use-api";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useAuth } from "@/lib/auth";
import { useChat, useChatEvents } from "@/lib/chat";
import { useImmersive } from "@/lib/shell";
import { useIsDesktop } from "@/lib/use-media-query";

const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

// useSearchParams braucht eine Suspense-Grenze (sonst bricht der statische Build ab)
export default function ChatPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <ChatView />
    </Suspense>
  );
}

/**
 * Chat mit Zustand in der URL: ?c=<id> = offene Unterhaltung, ?neu=1 = neuer Chat.
 * Handy: Oeffnen legt einen Verlaufseintrag an (Zurueck-Taste schliesst den Thread), Thread im Vollbild.
 * Desktop: zweispaltig, Auswahl ersetzt den Eintrag (kein Verlauf je Klick).
 */
function ChatView() {
  const { user } = useAuth();
  const { live } = useChat();
  const router = useRouter();
  const pathname = usePathname() ?? "/chat";
  const params = useSearchParams();
  const active = params.get("c");
  const creating = !active && params.get("neu") === "1";
  const isDesktop = useIsDesktop();
  const conversations = useApi<ConversationSummary[]>("/chat/conversations", { refreshOnFocus: true });
  const list = conversations.data;
  const load = conversations.reload;
  useChatEvents(load);

  const inThread = !!active || creating;
  const immersive = inThread && !isDesktop;
  useImmersive(immersive);
  const ptr = usePullToRefresh(load, { enabled: !inThread });
  useEffect(() => (immersive ? lockScroll() : undefined), [immersive]);

  // Haben wir selbst einen Verlaufseintrag angelegt? Dann fuehrt "Zurueck" per history zurueck,
  // sonst (Direktlink, z. B. aus einer Mitteilung) wird die Liste ersetzt, statt die App zu verlassen.
  const pushedHere = useRef(false);
  const navigate = useCallback(
    (query: string) => {
      const href = query ? `${pathname}?${query}` : pathname;
      if (isDesktop || !query) router.replace(href, { scroll: false });
      else {
        pushedHere.current = true;
        router.push(href, { scroll: false });
      }
    },
    [isDesktop, pathname, router],
  );

  const openConversation = (id: string) => navigate(`c=${encodeURIComponent(id)}`);
  const startCreating = () => navigate("neu=1");
  const backToList = () => {
    if (!isDesktop && pushedHere.current) {
      pushedHere.current = false;
      router.back();
    } else router.replace(pathname, { scroll: false });
  };

  // Desktop: erste Unterhaltung direkt oeffnen; Handy: erst die Liste zeigen.
  useEffect(() => {
    if (isDesktop && list && !active && !creating && list[0]) router.replace(`${pathname}?c=${encodeURIComponent(list[0].id)}`, { scroll: false });
  }, [list, isDesktop]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wurde die aktive Unterhaltung entfernt (z. B. Gruppe verlassen), zurueck zur Liste.
  // Ausnahme: gerade angelegt, die Liste ist aber noch nicht neu geladen.
  const pendingId = useRef<string | null>(null);
  useEffect(() => {
    if (!list || !active) return;
    if (list.some((c) => c.id === active)) {
      if (pendingId.current === active) pendingId.current = null;
      return;
    }
    if (pendingId.current === active) return;
    router.replace(pathname, { scroll: false });
  }, [list, active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zurueck am Handy (Knopf oder Browser-Taste): Fokus auf den Listeneintrag der letzten Unterhaltung
  const lastActive = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastActive.current;
    lastActive.current = active;
    // Browser-Zurueck hat unseren Eintrag verbraucht: naechster Thread ohne eigenen Push darf nicht history.back() nutzen
    if (!active && !creating) pushedHere.current = false;
    if (!active && prev && !isDesktop) {
      document.querySelector<HTMLElement>(`[data-conv-id="${CSS.escape(prev)}"]`)?.focus();
    }
  }, [active, isDesktop]);

  const showList = !inThread;

  return (
    <>
      {/* contents: die kleine Titelleiste bleibt beim Scrollen der Liste haften */}
      <div className={clsx("contents", inThread && "max-md:hidden")}>
        <PullIndicator {...ptr} />
        <LargeTitleHeader
          title="Chat"
          subtitle={live ? "Verbunden – Nachrichten kommen sofort an." : "Nachrichten werden regelmäßig abgerufen."}
          action={<Button onClick={startCreating}>Neuer Chat</Button>}
        />
        {conversations.error && list && <div className="mb-3"><Alert>{conversations.error}</Alert></div>}
      </div>

      <div
        className={clsx(
          // grid-cols-1 = minmax(0, 1fr): sonst waechst die implizite Spalte mit dem Inhalt und schneidet rechts ab
          "grid grid-cols-1 overflow-hidden bg-surface md:h-[calc(100dvh-14rem)] md:min-h-[26rem] md:grid-cols-[17rem_1fr] md:rounded-xl md:border md:border-border",
          inThread ? "max-md:h-dvh" : "rounded-xl border border-border max-md:h-auto",
        )}
      >
        <ul
          className={clsx("min-h-0 border-border md:block md:overflow-y-auto md:border-r", showList ? "block" : "hidden")}
          aria-label="Unterhaltungen"
        >
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
            <li className="p-3">
              <EmptyState emoji="💬" title="Noch keine Unterhaltungen." action={<Button onClick={startCreating}>Neuer Chat</Button>}>
                Schreib einem Vereinsmitglied oder dem Vorstand.
              </EmptyState>
            </li>
          )}
          {list?.map((c) => {
            const d = c.lastMessage ? new Date(c.lastMessage.createdAt) : null;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  data-conv-id={c.id}
                  onClick={() => openConversation(c.id)}
                  aria-current={c.id === active ? "true" : undefined}
                  className={clsx("flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-2", c.id === active && "bg-surface-2")}
                >
                  <Avatar name={c.title} mediaId={c.avatarId} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.title}</span>
                      {d && <span className="shrink-0 text-xs text-muted">{sameDay(d, new Date()) ? timeFmt.format(d) : dayFmt.format(d)}</span>}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className={clsx("truncate text-xs", c.unread ? "font-medium text-text" : "text-muted")}>
                        {c.lastMessage ? `${c.lastMessage.mine ? "Du: " : ""}${c.lastMessage.preview}` : "Noch keine Nachricht"}
                      </span>
                      {c.unread > 0 && (
                        <Badge tone="brand">
                          <span aria-hidden>{c.unread}</span>
                          <span className="sr-only">{c.unread} ungelesen</span>
                        </Badge>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className={clsx("min-h-0 flex-col", showList ? "hidden md:flex" : "flex")}>
          {creating ? (
            <NewChat
              onClose={backToList}
              onCreated={(id) => {
                // ?neu=1 durch ?c=<id> ersetzen: Zurueck fuehrt dann zur Liste, nicht zum Formular
                pendingId.current = id;
                router.replace(`${pathname}?c=${encodeURIComponent(id)}`, { scroll: false });
                load();
              }}
            />
          ) : active && user ? (
            <Thread key={active} id={active} me={user} onBack={backToList} onChanged={load} focusTitle={!isDesktop} />
          ) : (
            <div className="m-auto w-full max-w-sm p-6">
              <EmptyState icon={MessageSquare} title="Keine Unterhaltung ausgewählt." action={<Button variant="secondary" onClick={startCreating}>Neuer Chat</Button>}>
                Wähle links eine Unterhaltung oder starte einen neuen Chat.
              </EmptyState>
            </div>
          )}
        </div>
      </div>
      <p className={clsx("mt-2 text-xs text-muted", inThread && "max-md:hidden")}>
        Nachrichten werden verschlüsselt gespeichert und nach der eingestellten Frist automatisch gelöscht. Keine Ende-zu-Ende-Verschlüsselung: gemeldete Nachrichten können geprüft werden.
      </p>
    </>
  );
}
