"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ChatContact, ConversationDetail, MemberItem, OrgSummary } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Alert, Avatar, Button, Field } from "../ui";

export function NewChat({ onCreated, onClose }: { onCreated: (id: string) => void; onClose: () => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<"direct" | "group">("direct");
  const [contacts, setContacts] = useState<ChatContact[] | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState("");
  const [title, setTitle] = useState("");
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ChatContact[]>("/chat/contacts").then(setContacts).catch((e) => setError(describeError(e)));
    api<OrgSummary[]>("/orgs/mine").then((o) => {
      setOrgs(o);
      if (o[0]) setOrg(o[0].slug);
    }).catch(() => undefined);
  }, []);

  // Mitgliederliste (nur der Vorstand darf sie abrufen)
  useEffect(() => {
    if (tab !== "group" || !org) return;
    api<MemberItem[]>(`/orgs/${org}/members?status=active`).then((all) => setMembers(all.filter((m) => m.userId !== user?.id))).catch(() => setMembers([]));
    setPicked(new Set());
  }, [tab, org]);

  async function open(userId: string) {
    setBusy(true);
    setError(null);
    try {
      const c = await api<ConversationDetail>("/chat/conversations", { method: "POST", body: { kind: "direct", userId } });
      onCreated(c.id);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  async function createGroup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const c = await api<ConversationDetail>("/chat/conversations", { method: "POST", body: { kind: "group", orgSlug: org, title, memberIds: [...picked] } });
      onCreated(c.id);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  const filtered = (contacts ?? []).filter((c) => (c.name + c.context).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex h-full min-h-0 flex-col" role="dialog" aria-label="Neuer Chat">
      <header className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <p className="text-sm font-medium">Neuer Chat</p>
        <Button variant="ghost" size="sm" onClick={onClose}>Schließen</Button>
      </header>
      <div className="flex gap-1 p-3 pb-0" role="tablist">
        {(["direct", "group"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            disabled={t === "group" && orgs.length === 0}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${tab === t ? "bg-brand text-brand-contrast" : "text-muted hover:text-text"}`}
          >
            {t === "direct" ? "Direktnachricht" : "Gruppe"}
          </button>
        ))}
      </div>
      {error && <div className="p-3 pb-0"><Alert>{error}</Alert></div>}

      {tab === "direct" ? (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <label htmlFor="contact-q" className="sr-only">Person suchen</label>
          <input
            id="contact-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Person oder Verein suchen …"
            className="mb-2 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          {contacts === null ? (
            <p className="text-sm text-muted" role="status">Lade …</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted">
              Du kannst Mitgliedern deiner Vereine und dem Vorstand von Vereinen schreiben, denen du folgst. Tritt einem Verein bei, um Kontakte zu sehen.
            </p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {filtered.map((c) => (
                <li key={c.userId}>
                  <button disabled={busy} onClick={() => open(c.userId)} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-surface-2">
                    <Avatar name={c.name} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-muted">{c.context}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <form onSubmit={createGroup} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <div className="space-y-1.5">
            <label htmlFor="g-org" className="text-sm font-medium">Verein</label>
            <select id="g-org" value={org} onChange={(e) => setOrg(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm">
              {orgs.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
            </select>
          </div>
          <Field id="g-title" label="Gruppenname" required minLength={2} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          <fieldset className="min-h-0">
            <legend className="mb-1 text-sm font-medium">Mitglieder ({picked.size})</legend>
            {members.length === 0 ? (
              <p className="text-xs text-muted">Keine weiteren aktiven Mitglieder abrufbar (nur der Vorstand sieht die Mitgliederliste). Du kannst die Gruppe leer anlegen und später Mitglieder hinzufügen.</p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {members.map((m) => (
                  <li key={m.userId}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" className="accent-[var(--brand)]" checked={picked.has(m.userId)} onChange={(e) => setPicked((s) => { const n = new Set(s); e.target.checked ? n.add(m.userId) : n.delete(m.userId); return n; })} />
                      {m.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          <Button type="submit" disabled={busy || title.trim().length < 2}>Gruppe anlegen</Button>
        </form>
      )}
    </div>
  );
}
