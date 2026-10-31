"use client";

import clsx from "clsx";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage, ConversationDetail, MessagePage, PublicUser } from "@vereine/shared";
import { CHAT_MAX_BODY } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useChat, useChatEvents } from "@/lib/chat";
import { Alert, Avatar, Badge, Button } from "../ui";

const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
const REPORT_REASONS = [
  { id: "spam", label: "Spam" },
  { id: "hate", label: "Hass / Hetze" },
  { id: "illegal", label: "Illegal" },
  { id: "other", label: "Sonstiges" },
] as const;

export function Thread({
  id,
  me,
  onBack,
  onChanged,
}: {
  id: string;
  me: PublicUser;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { refreshUnread } = useChat();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [older, setOlder] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const markRead = useCallback(() => {
    api("/chat/conversations/" + id + "/read", { method: "POST", body: {} })
      .then(() => {
        refreshUnread();
        onChanged();
      })
      .catch(() => undefined);
  }, [id, refreshUnread, onChanged]);

  const loadLatest = useCallback(async () => {
    try {
      const [d, page] = await Promise.all([
        api<ConversationDetail>(`/chat/conversations/${id}`),
        api<MessagePage>(`/chat/conversations/${id}/messages`),
      ]);
      setDetail(d);
      setMsgs((prev) => {
        // neueste Seite einmischen, bereits geladene aeltere Nachrichten behalten
        const known = new Map(prev.map((m) => [m.id, m]));
        page.messages.forEach((m) => known.set(m.id, m));
        return [...known.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      });
      setOlder((prev) => prev ?? page.nextCursor);
    } catch (e) {
      setError(describeError(e));
    }
  }, [id]);

  useEffect(() => {
    setDetail(null);
    setMsgs([]);
    setOlder(null);
    setError(null);
    setInfo(false);
    stickToBottom.current = true;
    void loadLatest().then(markRead);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useChatEvents((e) => {
    if (e.type === "poll" || ("conversationId" in e && e.conversationId === id)) {
      void loadLatest().then(() => e.type === "message" && markRead());
    }
  });

  useLayoutEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

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

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const m = await api<ChatMessage>(`/chat/conversations/${id}/messages`, { method: "POST", body: { body } });
      stickToBottom.current = true;
      setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setText("");
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSending(false);
    }
  }

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(describeError(e));
    }
  };

  if (!detail) {
    return <p className="m-auto text-sm text-muted" role="status">{error ?? "Lade …"}</p>;
  }

  const other = detail.kind === "direct" ? detail.members.find((m) => m.userId !== me.id) : undefined;
  let lastDay = "";

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={`Unterhaltung mit ${detail.title}`}>
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Button variant="ghost" size="sm" className="md:hidden" onClick={onBack} aria-label="Zurück zur Liste">←</Button>
        <Avatar name={detail.title} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{detail.title}</p>
          <p className="truncate text-xs text-muted">
            {detail.kind === "group" ? `${detail.members.length} Mitglieder` : "Direktnachricht"}
            {" · "}Löschung nach {detail.effectiveRetentionDays} Tagen
          </p>
        </div>
        <Button variant="ghost" size="sm" aria-expanded={info} onClick={() => setInfo((v) => !v)}>Info</Button>
      </header>

      {info && (
        <div className="space-y-3 border-b border-border bg-surface-2 p-3 text-sm">
          {detail.kind === "group" ? (
            <>
              <ul className="flex flex-wrap gap-2">
                {detail.members.map((m) => (
                  <li key={m.userId} className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1">
                    {m.name} {m.role === "owner" && <Badge tone="brand">Besitzer</Badge>}
                    {detail.iAmOwner && m.userId !== me.id && (
                      <button
                        type="button"
                        aria-label={`${m.name} entfernen`}
                        className="ml-1 text-muted hover:text-danger"
                        onClick={() => run(async () => { await api(`/chat/conversations/${id}/members/${m.userId}`, { method: "DELETE" }); await loadLatest(); })}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {detail.iAmOwner && (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="retention" className="text-xs text-muted">Nachrichten löschen nach</label>
                  <select
                    id="retention"
                    value={detail.retentionDays ?? ""}
                    onChange={(e) =>
                      run(async () => setDetail(await api<ConversationDetail>(`/chat/conversations/${id}/retention`, { method: "PUT", body: { days: e.target.value ? Number(e.target.value) : null } })))
                    }
                    className="h-8 rounded-lg border border-border bg-bg px-2 text-xs"
                  >
                    <option value="">Standard ({365} Tage)</option>
                    {[7, 30, 90, 180, 365, 730].map((d) => (
                      <option key={d} value={d}>{d} Tage</option>
                    ))}
                  </select>
                </div>
              )}
              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  confirm("Gruppe verlassen?") &&
                  run(async () => {
                    await api(`/chat/conversations/${id}/members/${me.id}`, { method: "DELETE" });
                    onChanged();
                    onBack();
                  })
                }
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
                  onClick={() => run(async () => { await api(`/chat/blocks/${other.userId}`, { method: detail.blocked ? "DELETE" : "PUT", body: detail.blocked ? undefined : {} }); await loadLatest(); })}
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
        className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        aria-live="polite"
      >
        {older && (
          <div className="pb-2 text-center">
            <Button variant="ghost" size="sm" onClick={loadOlder}>Ältere Nachrichten laden</Button>
          </div>
        )}
        {msgs.length === 0 && <p className="py-8 text-center text-sm text-muted">Noch keine Nachrichten. Schreib die erste!</p>}
        {msgs.map((m) => {
          const day = dayFmt.format(new Date(m.createdAt));
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay && <p className="my-2 text-center text-xs text-muted">{day}</p>}
              <div className={clsx("group flex items-end gap-1", m.mine ? "justify-end" : "justify-start")}>
                <div className={clsx("max-w-[80%] rounded-2xl px-3 py-2 text-sm", m.mine ? "bg-brand text-brand-contrast" : "bg-surface-2", m.deleted && "italic opacity-70")}>
                  {detail.kind === "group" && !m.mine && <p className="mb-0.5 text-xs font-medium text-brand">{m.senderName}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.deleted ? "Nachricht gelöscht" : m.body}</p>
                  <p className={clsx("mt-0.5 text-right text-[10px]", m.mine ? "text-brand-contrast/70" : "text-muted")}>{timeFmt.format(new Date(m.createdAt))}</p>
                </div>
                {!m.deleted && (
                  <div className="relative">
                    <button
                      type="button"
                      aria-label="Nachrichtenoptionen"
                      aria-expanded={menu === m.id}
                      onClick={() => setMenu(menu === m.id ? null : m.id)}
                      className="rounded px-1 text-muted opacity-60 hover:opacity-100 focus:opacity-100"
                    >
                      ⋯
                    </button>
                    {menu === m.id && (
                      <div className={clsx("absolute bottom-6 z-10 w-40 rounded-lg border border-border bg-surface p-1 text-sm shadow-lg", m.mine ? "right-0" : "left-0")}>
                        {m.mine ? (
                          <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => run(async () => { await api(`/chat/messages/${m.id}`, { method: "DELETE" }); setMenu(null); await loadLatest(); })}>
                            Löschen
                          </button>
                        ) : (
                          REPORT_REASONS.map((r) => (
                            <button key={r.id} className="block w-full rounded px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => run(async () => { await api(`/chat/messages/${m.id}/report`, { method: "POST", body: { reason: r.id } }); setMenu(null); setError(null); alert("Danke, die Nachricht wurde gemeldet."); })}>
                              Melden: {r.label}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <div className="px-3 pb-2"><Alert>{error}</Alert></div>}

      <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
        <label htmlFor="msg" className="sr-only">Nachricht</label>
        <textarea
          id="msg"
          value={text}
          rows={1}
          maxLength={CHAT_MAX_BODY}
          disabled={detail.blocked}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={detail.blocked ? "Du hast diese Person blockiert." : "Nachricht schreiben … (Enter sendet)"}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60"
        />
        <Button type="submit" disabled={!text.trim() || sending || detail.blocked}>Senden</Button>
      </form>
    </section>
  );
}
