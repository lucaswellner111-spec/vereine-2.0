"use client";

import { useEffect, useState } from "react";
import type { LikerItem, LikersPage } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useBusy } from "@/lib/use-api";
import { Alert, Button, UserAvatarLink, UserNameLink } from "./ui";
import { Dialog } from "./ui-client";

/** "Gefällt N Personen": Sheet mit den Personen, deren Profil der Betrachter sehen darf; private Profile bleiben verborgen. */
export function LikersSheet({ postId, open, onClose }: { postId: string; open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<LikerItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();

  const load = (next: string | null) =>
    run(async () => {
      setError(null);
      try {
        const r = await api<LikersPage>(`/posts/${postId}/likes${next ? `?cursor=${encodeURIComponent(next)}` : ""}`);
        setItems((prev) => (next && prev ? [...prev, ...r.items.filter((x) => !prev.some((y) => y.id === x.id))] : r.items));
        setTotal(r.total);
        setCursor(r.nextCursor);
      } catch (e) {
        setError(describeError(e));
      }
    });

  useEffect(() => {
    if (!open) return;
    setItems(null);
    setCursor(null);
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId]);

  const hidden = items ? Math.max(0, total - items.length) : 0;
  return (
    <Dialog open={open} onClose={onClose} title="Gefällt mir" description={total ? `${total} ${total === 1 ? "Person" : "Personen"}` : undefined} placement="sheet" size="sm">
      {error && <Alert>{error}</Alert>}
      {items === null && !error && <p role="status" className="py-6 text-center text-sm text-muted">Lade …</p>}
      {items?.length === 0 && !cursor && <p className="py-6 text-center text-sm text-muted">Noch keine Likes, deren Profil du sehen darfst.</p>}
      {items && items.length > 0 && (
        <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto overscroll-contain">
          {items.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <UserAvatarLink handle={p.handle} name={p.name} mediaId={p.avatarId} size={40} />
              <div className="min-w-0">
                <UserNameLink handle={p.handle} name={p.name} className="block truncate text-sm font-semibold" />
                {p.handle && <span className="block truncate text-xs text-muted">@{p.handle}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <div className="mt-3 text-center">
          <Button variant="secondary" busy={busy} onClick={() => void load(cursor)}>
            Mehr laden
          </Button>
        </div>
      )}
      {hidden > 0 && !cursor && <p className="mt-3 text-center text-xs text-muted">{hidden} weitere mit nicht sichtbarem Profil.</p>}
    </Dialog>
  );
}
