"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatContact, ConversationDetail, OrgMemberName, OrgSummary } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { Alert, Avatar, Button, ErrorState, Field, Input, ListSkeleton, SelectField } from "../ui";
import { SegmentedControl, tabPanelProps } from "../ui-client";

type Tab = "direct" | "group";

export function NewChat({ onCreated, onClose }: { onCreated: (id: string) => void; onClose: () => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("direct");
  const contactList = useApi<ChatContact[]>("/chat/contacts");
  const contacts = contactList.data;
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState("");
  const [title, setTitle] = useState("");
  const [members, setMembers] = useState<OrgMemberName[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Beim Oeffnen Fokus auf die Ueberschrift (Inline-Bereich, kein modaler Dialog)
  useEffect(() => titleRef.current?.focus(), []);

  useEffect(() => {
    api<OrgSummary[]>("/orgs/mine").then((o) => {
      setOrgs(o);
      if (o[0]) setOrg(o[0].slug);
    }).catch(() => undefined);
  }, []);

  // Namensliste aktiver Mitglieder (nur Vorstand und Moderation duerfen sie abrufen)
  useEffect(() => {
    if (tab !== "group" || !org) return;
    api<OrgMemberName[]>(`/orgs/${org}/member-names`).then((all) => setMembers(all.filter((m) => m.userId !== user?.id))).catch(() => setMembers([]));
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
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="newchat-title">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5 max-md:py-1.5 max-md:pl-1">
        <button
          type="button"
          onClick={onClose}
          aria-label="Neuen Chat schließen"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text md:h-8 md:w-8"
        >
          <ArrowLeft size={18} aria-hidden />
        </button>
        <h2 id="newchat-title" ref={titleRef} tabIndex={-1} className="text-sm font-medium focus:outline-none focus-visible:underline">
          Neuer Chat
        </h2>
      </header>
      <div className="p-3 pb-0">
        <SegmentedControl
          aria-label="Chat-Art"
          mode="tabs"
          idBase="newchat"
          panelId="newchat-panel"
          value={tab}
          onChange={setTab}
          options={[
            { value: "direct", label: "Direktnachricht" },
            { value: "group", label: "Gruppe", disabled: orgs.length === 0 },
          ]}
        />
      </div>
      {error && <div className="p-3 pb-0"><Alert>{error}</Alert></div>}

      <div {...tabPanelProps("newchat", "newchat-panel", tab)} className="flex min-h-0 flex-1 flex-col focus:outline-none">
      {tab === "direct" ? (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <label htmlFor="contact-q" className="sr-only">Person suchen</label>
          <Input
            id="contact-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Person oder Verein suchen …"
            className="mb-2 w-full"
          />
          {contactList.error && !contacts ? (
            <ErrorState message={contactList.error} onRetry={contactList.reload} />
          ) : contacts === null ? (
            <ListSkeleton rows={3} />
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
          <SelectField id="g-org" label="Verein" value={org} onChange={(e) => setOrg(e.target.value)}>
            {orgs.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
          </SelectField>
          <Field id="g-title" label="Gruppenname" required minLength={2} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          <fieldset className="min-h-0">
            <legend className="mb-1 text-sm font-medium">Mitglieder ({picked.size})</legend>
            {members.length === 0 ? (
              <p className="text-xs text-muted">Keine weiteren aktiven Mitglieder abrufbar. Gruppen legen nur Vorstand und Moderation an; du kannst die Gruppe auch leer anlegen und später Mitglieder hinzufügen.</p>
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
          <Button type="submit" busy={busy} disabled={title.trim().length < 2}>Gruppe anlegen</Button>
        </form>
      )}
      </div>
    </section>
  );
}
