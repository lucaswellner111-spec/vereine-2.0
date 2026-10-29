"use client";

import clsx from "clsx";
import { useEffect, useState, type FormEvent } from "react";
import { Avatar, Badge, Button, ConceptNote, PageHeader } from "@/components/ui";
import { conversations as initial } from "@/lib/mock";

export default function ChatPage() {
  const [convs, setConvs] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Desktop: erste Unterhaltung direkt oeffnen; Mobil: erst die Liste zeigen.
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) setActiveId(initial[0].id);
  }, []);
  const [text, setText] = useState("");
  const active = convs.find((c) => c.id === activeId) ?? null;

  function send(e: FormEvent) {
    e.preventDefault();
    if (!active || !text.trim()) return;
    setConvs((all) =>
      all.map((c) =>
        c.id === active.id
          ? { ...c, preview: text.trim(), time: "jetzt", unread: 0, messages: [...c.messages, { from: "me" as const, text: text.trim(), time: "jetzt" }] }
          : c,
      ),
    );
    setText("");
  }

  return (
    <>
      <PageHeader title="Chat" subtitle="Nachrichten sind auf dem Server verschlüsselt gespeichert." />
      <ConceptNote>Echtzeit (WebSocket), Gruppen, Medien, Blockieren und automatische Löschfristen folgen im Modul „Chat“.</ConceptNote>

      <div className="grid min-h-[28rem] overflow-hidden rounded-xl border border-border bg-surface md:grid-cols-[16rem_1fr]">
        <ul className={clsx("border-border md:block md:border-r", activeId ? "hidden" : "block")} aria-label="Unterhaltungen">
          {convs.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setActiveId(c.id)}
                aria-current={c.id === activeId}
                className={clsx("flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-2", c.id === activeId && "bg-surface-2")}
              >
                <Avatar name={c.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    <span className="text-xs text-muted">{c.time}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted">{c.preview}</span>
                    {c.unread > 0 && <Badge tone="brand">{c.unread}</Badge>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <section className={clsx("flex-col", activeId ? "flex" : "hidden md:flex")}>
          {active ? (
            <>
              <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setActiveId(null)}>←</Button>
                <Avatar name={active.name} size={30} />
                <span className="font-medium">{active.name}</span>
                {active.group && <Badge>Gruppe</Badge>}
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
                {active.messages.map((m, i) => (
                  <div key={i} className={clsx("flex", m.from === "me" ? "justify-end" : "justify-start")}>
                    <p className={clsx("max-w-[80%] rounded-2xl px-3 py-2 text-sm", m.from === "me" ? "bg-brand text-brand-contrast" : "bg-surface-2")}>
                      {m.text}
                    </p>
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
                <label htmlFor="msg" className="sr-only">Nachricht</label>
                <input
                  id="msg"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Nachricht schreiben …"
                  className="h-10 flex-1 rounded-lg border border-border bg-bg px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
                <Button type="submit" disabled={!text.trim()}>Senden</Button>
              </form>
            </>
          ) : (
            <p className="m-auto text-sm text-muted">Wähle eine Unterhaltung.</p>
          )}
        </section>
      </div>
    </>
  );
}
