"use client";

import clsx from "clsx";
import { AlertCircle, ArrowLeft, Clock, MoreHorizontal, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage, ConversationDetail, MessagePage, PublicUser } from "@vereine/shared";
import { CHAT_MAX_BODY } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useChat, useChatEvents } from "@/lib/chat";
import { announceText, foreignNewMessages } from "@/lib/chat-announce";
import { COARSE_POINTER_QUERY, enterSends, useAutoGrow, visibleOutbox } from "@/lib/chat-input";
import { useMediaQuery } from "@/lib/use-media-query";
import { REPORT_REASONS } from "@/lib/labels";
import { Alert, Avatar, Badge, Button, ErrorState, Select, Skeleton, Textarea, UserAvatarLink, UserNameLink } from "../ui";
import { DropdownMenu, type MenuEntry } from "../ui-client";
import { ask, toast } from "@/components/ui-hosts";
import { AddMembersDialog } from "./add-members-dialog";

const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

/** Eigene Nachricht, die noch beim Server ist (temporaere ID) oder nicht gesendet werden konnte. */
// skip: eigene gleichlautende Nachrichten, die beim Absenden schon da waren (Abgleich mit Live-Ereignissen)
type Outgoing = { tempId: string; body: string; createdAt: string; status: "sending" | "failed"; skip: string[] };
let tempSeq = 0;

export function Thread({
  id,
  me,
  onBack,
  onChanged,
  focusTitle = false,
}: {
  id: string;
  me: PublicUser;
  onBack: () => void;
  onChanged: () => void;
  /** Titel nach dem Laden fokussieren (Handy: Thread ersetzt die Liste). */
  focusTitle?: boolean;
}) {
  const { refreshUnread } = useChat();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [msgs, setMsgsState] = useState<ChatMessage[]>([]);
  const [older, setOlder] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [adding, setAdding] = useState(false);
  const [outbox, setOutbox] = useState<Outgoing[]>([]);
  // Sperre gegen doppeltes "Erneut senden": tempIds, die gerade unterwegs sind
  const inFlight = useRef(new Set<string>());
  const [announce, setAnnounce] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const coarse = useMediaQuery(COARSE_POINTER_QUERY);
  useAutoGrow(inputRef, text);
  const bottomRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const stickToBottom = useRef(true);
  // Synchroner Stand der Nachrichten (fuer den Vergleich alt/neu bei Live-Ansagen); null = noch nicht geladen
  const msgsRef = useRef<ChatMessage[] | null>(null);
  const setMsgs = useCallback((fn: (prev: ChatMessage[]) => ChatMessage[]) => {
    const next = fn(msgsRef.current ?? []);
    msgsRef.current = next;
    setMsgsState(next);
  }, []);

  const markRead = useCallback(() => {
    api("/chat/conversations/" + id + "/read", { method: "POST", body: {} })
      .then(() => {
        refreshUnread();
        onChanged();
      })
      .catch(() => undefined);
  }, [id, refreshUnread, onChanged]);

  /** Neueste Seite laden; speak = neue fremde Nachrichten fuer Screenreader ansagen (nur bei Events/Poll). */
  const loadLatest = useCallback(
    async (speak = false) => {
      try {
        const [d, page] = await Promise.all([
          api<ConversationDetail>(`/chat/conversations/${id}`),
          api<MessagePage>(`/chat/conversations/${id}/messages`),
        ]);
        setDetail(d);
        const prev = msgsRef.current;
        setMsgs((current) => {
          // neueste Seite einmischen, bereits geladene aeltere Nachrichten behalten
          const known = new Map(current.map((m) => [m.id, m]));
          page.messages.forEach((m) => known.set(m.id, m));
          return [...known.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
        });
        if (speak) {
          const text = announceText(foreignNewMessages(prev, msgsRef.current ?? []), d.title);
          if (text) setAnnounce(text);
        }
        setOlder((o) => o ?? page.nextCursor);
      } catch (e) {
        setError(describeError(e));
      }
    },
    [id, setMsgs],
  );

  useEffect(() => {
    setDetail(null);
    msgsRef.current = null;
    setMsgsState([]);
    setOlder(null);
    setError(null);
    setInfo(false);
    setOutbox([]);
    setAnnounce("");
    stickToBottom.current = true;
    // Erstladen: nur Basislinie fuer spaetere Ansagen
    void loadLatest(false).then(markRead);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useChatEvents((e) => {
    if (e.type === "poll" || ("conversationId" in e && e.conversationId === id)) {
      void loadLatest(true).then(() => e.type === "message" && markRead());
    }
  });

  // Handy: nach dem Oeffnen den Titel fokussieren (Screenreader hoert, wo er ist)
  const titleFocused = useRef(false);
  useEffect(() => {
    if (focusTitle && detail && !titleFocused.current) {
      titleFocused.current = true;
      titleRef.current?.focus();
    }
  }, [focusTitle, detail]);

  useLayoutEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, outbox]);

  async function loadOlder() {
    if (!older) return;
    stickToBottom.current = false;
    try {
      const page = await api<MessagePage>(`/chat/conversations/${id}/messages?cursor=${encodeURIComponent(older)}`);
      setMsgs((prev) => [...page.messages, ...prev]);
      setOlder(page.nextCursor);
    } catch (e) {
      setError(describeError(e));
    }
  }

  /** Schickt eine wartende Nachricht; Erfolg ersetzt sie durch die Server-Nachricht (Abgleich ueber die Server-ID). */
  async function deliver(item: Outgoing) {
    if (inFlight.current.has(item.tempId)) return; // laeuft schon
    inFlight.current.add(item.tempId);
    setOutbox((o) => o.map((x) => (x.tempId === item.tempId ? { ...x, status: "sending" } : x)));
    try {
      const m = await api<ChatMessage>(`/chat/conversations/${id}/messages`, { method: "POST", body: { body: item.body } });
      // Kam die Nachricht schon per Live-Ereignis, nicht doppelt einfuegen
      setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setOutbox((o) => o.filter((x) => x.tempId !== item.tempId));
      onChanged();
    } catch (err) {
      setOutbox((o) => o.map((x) => (x.tempId === item.tempId ? { ...x, status: "failed" } : x)));
      setAnnounce(`Nicht gesendet: ${describeError(err)}`);
    } finally {
      inFlight.current.delete(item.tempId);
    }
  }

  function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError(null);
    const skip = (msgsRef.current ?? []).filter((m) => m.mine && m.body === body).map((m) => m.id);
    const item: Outgoing = { tempId: `tmp-${++tempSeq}`, body, createdAt: new Date().toISOString(), status: "sending", skip };
    stickToBottom.current = true;
    setOutbox((o) => [...o, item]);
    setText("");
    void deliver(item);
  }

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(describeError(e));
    }
  };

  // Live-Bereich immer im DOM, damit Screenreader Aenderungen zuverlaessig ansagen
  const liveRegion = (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {announce}
    </p>
  );

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      aria-label="Zurück zur Liste"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text md:hidden"
    >
      <ArrowLeft size={18} aria-hidden />
    </button>
  );

  if (!detail) {
    return (
      <>
        {liveRegion}
        <div className="flex items-center border-b border-border px-1 py-1 md:hidden">{backButton}</div>
        {error ? (
          <div className="m-auto w-full max-w-sm p-4">
            <ErrorState
              message={error}
              onRetry={() => {
                setError(null);
                void loadLatest();
              }}
            />
          </div>
        ) : (
          <div role="status" aria-label="Lade" className="flex flex-1 flex-col gap-3 p-4">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-10 w-2/3 self-start rounded-2xl" />
            <Skeleton className="h-10 w-1/2 self-end rounded-2xl" />
            <Skeleton className="h-10 w-3/5 self-start rounded-2xl" />
          </div>
        )}
      </>
    );
  }

  const other = detail.kind === "direct" ? detail.members.find((m) => m.userId !== me.id) : undefined;
  const handleOf = new Map(detail.members.map((m) => [m.userId, m.handle]));
  let lastDay = "";

  const messageMenu = (m: ChatMessage): MenuEntry[] =>
    m.mine
      ? [
          {
            id: "delete",
            label: "Löschen",
            icon: Trash2,
            danger: true,
            onSelect: async () => {
              if (!(await ask("Nachricht löschen?", { confirmLabel: "Löschen", danger: true }))) return;
              await run(async () => {
                await api(`/chat/messages/${m.id}`, { method: "DELETE" });
                await loadLatest();
              });
            },
          },
        ]
      : [
          {
            type: "group",
            id: "report",
            label: "Melden",
            items: REPORT_REASONS.map((r) => ({
              id: r.id,
              label: r.label,
              onSelect: () =>
                void run(async () => {
                  await api(`/chat/messages/${m.id}/report`, { method: "POST", body: { reason: r.id } });
                  toast.success("Danke, die Nachricht wurde gemeldet.");
                }),
            })),
          },
        ];

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby={`thread-title-${id}`}>
      {liveRegion}
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5 max-md:py-1.5 max-md:pl-1">
        {backButton}
        {other ? (
          <UserAvatarLink handle={other.handle} name={detail.title} size={32} mediaId={detail.avatarId} decorative />
        ) : (
          <Avatar name={detail.title} size={32} mediaId={detail.avatarId} />
        )}
        <div className="min-w-0 flex-1">
          <h2 id={`thread-title-${id}`} ref={titleRef} tabIndex={-1} className="truncate text-sm font-medium focus:outline-none focus-visible:underline">
            {other ? <UserNameLink handle={other.handle} name={detail.title} /> : detail.title}
          </h2>
          <p className="truncate text-xs text-muted">
            {detail.kind === "group" ? `${detail.members.length} Mitglieder` : "Direktnachricht"}
            {" · "}Löschung nach {detail.effectiveRetentionDays} Tagen
          </p>
        </div>
        <Button variant="ghost" size="sm" aria-expanded={info} onClick={() => setInfo((v) => !v)}>Info</Button>
        {detail.kind === "group" && detail.iAmOwner && (
          <DropdownMenu
            label="Gruppe verwalten"
            items={[{ id: "add", label: "Mitglied hinzufügen", icon: UserPlus, onSelect: () => setAdding(true) }]}
          />
        )}
      </header>
      {detail.kind === "group" && detail.iAmOwner && (
        <AddMembersDialog
          conversationId={id}
          open={adding}
          onClose={() => setAdding(false)}
          onAdded={(d) => {
            setDetail(d);
            onChanged();
          }}
        />
      )}

      {info && (
        <div className="space-y-3 border-b border-border bg-surface-2 p-3 text-sm">
          {detail.kind === "group" ? (
            <>
              <ul className="flex flex-wrap gap-2">
                {detail.members.map((m) => (
                  <li key={m.userId} className="inline-flex items-center gap-1.5 rounded-full bg-surface py-1 pl-1 pr-3">
                    <UserAvatarLink handle={m.handle} name={m.name} size={24} mediaId={m.avatarId} decorative />
                    <UserNameLink handle={m.handle} name={m.name} /> {m.role === "owner" && <Badge tone="brand">Besitzer</Badge>}
                    {detail.iAmOwner && m.userId !== me.id && (
                      <button
                        type="button"
                        aria-label={`${m.name} entfernen`}
                        className="relative hit-area ml-1 inline-flex rounded text-muted hover:text-danger"
                        onClick={async () => {
                          if (!(await ask(`${m.name} aus der Gruppe entfernen?`, { confirmLabel: "Entfernen" }))) return;
                          await run(async () => { await api(`/chat/conversations/${id}/members/${m.userId}`, { method: "DELETE" }); await loadLatest(); });
                        }}
                      >
                        <X size={14} aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {detail.iAmOwner && (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="retention" className="text-xs text-muted">Nachrichten löschen nach</label>
                  <Select
                    id="retention"
                    size="sm"
                    value={detail.retentionDays ?? ""}
                    onChange={(e) =>
                      run(async () => setDetail(await api<ConversationDetail>(`/chat/conversations/${id}/retention`, { method: "PUT", body: { days: e.target.value ? Number(e.target.value) : null } })))
                    }
                  >
                    <option value="">Standard ({365} Tage)</option>
                    {[7, 30, 90, 180, 365, 730].map((d) => (
                      <option key={d} value={d}>{d} Tage</option>
                    ))}
                  </Select>
                </div>
              )}
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  if (!(await ask("Gruppe verlassen?", { confirmLabel: "Verlassen" }))) return;
                  await run(async () => {
                    await api(`/chat/conversations/${id}/members/${me.id}`, { method: "DELETE" });
                    onChanged();
                    onBack();
                  });
                }}
              >
                Gruppe verlassen
              </Button>
            </>
          ) : (
            other && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={detail.blocked ? "secondary" : "danger"}
                  size="sm"
                  onClick={async () => {
                    // Nur beim Blockieren nachfragen; Entblocken geht sofort
                    if (!detail.blocked && !(await ask(`${other.name} blockieren? Ihr könnt euch dann nicht mehr schreiben.`, { confirmLabel: "Blockieren" }))) return;
                    await run(async () => { await api(`/chat/blocks/${other.userId}`, { method: detail.blocked ? "DELETE" : "PUT", body: detail.blocked ? undefined : {} }); await loadLatest(); });
                  }}
                >
                  {detail.blocked ? `${other.name} entblocken` : `${other.name} blockieren`}
                </Button>
                <span className="text-xs text-muted">Blockierte Personen können dir nicht schreiben.</span>
              </div>
            )
          )}
          <p className="text-xs text-muted">
            Nachrichten werden verschlüsselt gespeichert und nach {detail.effectiveRetentionDays} Tagen automatisch gelöscht. Bei einer Meldung wird nur die gemeldete Nachricht geprüft.
          </p>
        </div>
      )}

      <div
        role="region"
        aria-label="Nachrichtenverlauf"
        tabIndex={0}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {older && (
          <div className="pb-2 text-center">
            <Button variant="ghost" size="sm" onClick={loadOlder}>Ältere Nachrichten laden</Button>
          </div>
        )}
        {msgs.length === 0 && outbox.length === 0 && <p className="py-8 text-center text-sm text-muted">Noch keine Nachrichten. Schreib die erste!</p>}
        {msgs.map((m) => {
          const day = dayFmt.format(new Date(m.createdAt));
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay && <p className="my-2 text-center text-xs text-muted">{day}</p>}
              <div className={clsx("group flex items-end gap-1", m.mine ? "justify-end" : "justify-start")}>
                <div
                  className={clsx(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                    // geloeschte Nachricht einheitlich (auch eigene): neutrale Flaeche, gedaempfter Text, ohne Transparenz
                    m.deleted ? "bg-surface-2 italic text-muted" : m.mine ? "bg-brand text-brand-contrast" : "bg-surface-2",
                  )}
                >
                  {detail.kind === "group" && !m.mine && (
                    <p className="mb-0.5 text-xs font-medium text-brand">
                      {/* Handle aus der Mitgliederliste; ehemalige Mitglieder ohne Link */}
                      <UserNameLink handle={handleOf.get(m.senderId)} name={m.senderName} />
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.deleted ? "Nachricht gelöscht" : m.body}</p>
                  <p className={clsx("mt-0.5 text-right text-[11px]", m.mine && !m.deleted ? "text-brand-contrast/85" : "text-muted")}>
                    {timeFmt.format(new Date(m.createdAt))}
                  </p>
                </div>
                {!m.deleted && (
                  <DropdownMenu
                    label="Nachrichtenoptionen"
                    side="top"
                    align={m.mine ? "end" : "start"}
                    items={messageMenu(m)}
                    trigger={(p) => (
                      <button
                        {...p}
                        className="relative hit-area inline-flex h-7 w-7 items-center justify-center rounded text-muted opacity-60 hover:opacity-100 focus:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
                      >
                        <MoreHorizontal size={16} aria-hidden />
                      </button>
                    )}
                  />
                )}
              </div>
            </div>
          );
        })}
        {visibleOutbox(outbox, msgs).map((o) => (
          <div key={o.tempId} className="flex flex-col items-end gap-1">
            <div
              className={clsx(
                "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                o.status === "failed" ? "border border-danger/50 bg-surface-2" : "bg-brand text-brand-contrast",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{o.body}</p>
              <p className={clsx("mt-0.5 flex items-center justify-end gap-1 text-[11px]", o.status === "failed" ? "text-danger" : "text-brand-contrast/85")}>
                {o.status === "failed" ? "Nicht gesendet" : <><Clock size={11} aria-hidden /> wird gesendet …</>}
              </p>
            </div>
            {o.status === "failed" && (
              <div className="flex items-center gap-3 text-xs">
                <AlertCircle size={14} aria-hidden className="text-danger" />
                <button type="button" onClick={() => void deliver(o)} className="hit-area relative font-medium text-brand hover:underline">
                  Erneut senden
                </button>
                <button type="button" onClick={() => setOutbox((l) => l.filter((x) => x.tempId !== o.tempId))} className="hit-area relative text-muted hover:text-text">
                  Verwerfen
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <div className="px-3 pb-2"><Alert>{error}</Alert></div>}

      <form onSubmit={send} className="flex gap-2 border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3">
        <label htmlFor="msg" className="sr-only">Nachricht</label>
        <Textarea
          ref={inputRef}
          id="msg"
          value={text}
          rows={1}
          maxLength={CHAT_MAX_BODY}
          disabled={detail.blocked}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Desktop: Enter sendet, Umschalt+Enter = Zeile; Handy: Enter = Zeile, Senden per Knopf
            if (enterSends({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing }, coarse)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={detail.blocked ? "Du hast diese Person blockiert." : coarse ? "Nachricht schreiben …" : "Nachricht schreiben … (Enter sendet)"}
          className="max-h-40 min-h-10 flex-1 [field-sizing:content]"
        />
        <Button type="submit" className="self-end" disabled={!text.trim() || detail.blocked}>Senden</Button>
      </form>
    </section>
  );
}
