"use client";

import { api, describeError } from "@/lib/api";
import { useApi, useBusy } from "@/lib/use-api";
import { Button, Card, ErrorState, ListSkeleton } from "./ui";
import { ask, toast } from "./ui-hosts";

type Blocked = { userId: string; name: string };

/** Datenschutz-Einstellungen: im Chat blockierte Personen anzeigen und Blockierung aufheben. */
export function BlockedPeopleCard() {
  const list = useApi<Blocked[]>("/chat/blocks");
  const [busy, run] = useBusy();

  const unblock = (b: Blocked) =>
    void run(async () => {
      if (!(await ask(`Blockierung von ${b.name} aufheben? Ihr könnt euch dann wieder schreiben.`, { confirmLabel: "Aufheben", danger: false }))) return;
      try {
        await api(`/chat/blocks/${b.userId}`, { method: "DELETE" });
        list.setData((l) => l && l.filter((x) => x.userId !== b.userId));
        toast.success(`${b.name} ist nicht mehr blockiert.`);
      } catch (e) {
        toast.error(describeError(e));
      }
    });

  return (
    <>
      <h2 className="mb-2 font-semibold">Blockierte Personen</h2>
      {list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={list.reload} className="mb-6" />
      ) : !list.data ? (
        <ListSkeleton rows={2} className="mb-6" />
      ) : (
        <Card flush className="mb-6">
          {list.data.length === 0 ? (
            <p className="p-4 text-sm text-muted">Du hast niemanden blockiert. Blockierte Personen können dir keine Nachrichten schreiben.</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.data.map((b) => (
                <li key={b.userId} className="flex items-center justify-between gap-3 p-4">
                  <span className="min-w-0 truncate text-sm">{b.name}</span>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => unblock(b)}>Aufheben</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
