"use client";

import { useState } from "react";
import { CHAT_CANDIDATES_LIMIT, type ChatCandidate, type ConversationDetail } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useApi, useBusy } from "@/lib/use-api";
import { Alert, Avatar, Button, ListSkeleton } from "../ui";
import { Dialog, SearchField } from "../ui-client";
import { toast } from "../ui-hosts";

/** Besitzer einer Gruppe: aktive Vereinsmitglieder auswaehlen und hinzufuegen (Suche serverseitig ueber /candidates?q=, max. 50 Treffer). */
export function AddMembersDialog({
  conversationId,
  open,
  onClose,
  onAdded,
}: {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  onAdded: (detail: ConversationDetail) => void;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().slice(0, 80); // API erlaubt max. 80 Zeichen
  const candidates = useApi<ChatCandidate[]>(
    open ? `/chat/conversations/${conversationId}/candidates${term ? `?q=${encodeURIComponent(term)}` : ""}` : null,
    { debounceMs: 250, keepPrevious: true },
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();

  const close = () => {
    setPicked(new Set());
    setQ("");
    setError(null);
    onClose();
  };
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const submit = () =>
    void run(async () => {
      setError(null);
      try {
        const detail = await api<ConversationDetail>(`/chat/conversations/${conversationId}/members`, { method: "POST", body: { userIds: [...picked] } });
        toast.success(picked.size === 1 ? "Mitglied hinzugefügt." : `${picked.size} Mitglieder hinzugefügt.`);
        onAdded(detail);
        close();
      } catch (e) {
        setError(describeError(e));
      }
    });

  const list = candidates.data ?? [];

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Mitglied hinzufügen"
      description="Aktive Mitglieder des Vereins, die noch nicht in der Gruppe sind."
      footer={
        <>
          <Button variant="secondary" onClick={close}>Abbrechen</Button>
          <Button onClick={submit} busy={busy} disabled={picked.size === 0 || picked.size > 100}>
            {picked.size > 0 ? `${picked.size} hinzufügen` : "Hinzufügen"}
          </Button>
        </>
      }
    >
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      <SearchField id="add-members-q" label="Mitglieder suchen" value={q} onChange={setQ} placeholder="Name suchen …" className="mb-3" />
      {candidates.error && !candidates.data ? (
        <Alert>{candidates.error}</Alert>
      ) : !candidates.data ? (
        <ListSkeleton rows={3} />
      ) : list.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">{term ? "Niemand passt zur Suche." : "Alle Mitglieder sind schon in der Gruppe."}</p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto" aria-label="Mitglieder">
          {list.map((c) => (
            <li key={c.userId}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-surface-2">
                <input type="checkbox" checked={picked.has(c.userId)} onChange={() => toggle(c.userId)} className="h-4 w-4 accent-[var(--brand)] pointer-coarse:h-5 pointer-coarse:w-5" />
                <Avatar name={c.name} size={28} mediaId={c.avatarId} />
                <span className="min-w-0 truncate text-sm">{c.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {list.length >= CHAT_CANDIDATES_LIMIT && (
        <p className="mt-2 text-xs text-muted">Es werden höchstens {CHAT_CANDIDATES_LIMIT} Personen angezeigt. Suche nach dem Namen, um weitere zu finden.</p>
      )}
    </Dialog>
  );
}
