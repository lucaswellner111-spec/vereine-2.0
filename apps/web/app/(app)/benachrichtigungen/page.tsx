"use client";

import { BellOff, Check } from "lucide-react";
import type { NotificationsResponse } from "@vereine/shared";
import { NotificationRow } from "@/components/notification-bell";
import { Button, Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/ui";
import { toast } from "@/components/ui-hosts";
import { api, describeError } from "@/lib/api";
import { describeNotification, mergeNotifications } from "@/lib/notifications";
import { useApi, useBusy } from "@/lib/use-api";
import { useInfiniteScroll, useMoreFailed } from "@/lib/use-infinite-scroll";

const PATH = "/notifications?limit=30";

export default function NotificationsPage() {
  const list = useApi<NotificationsResponse>(PATH, { refreshOnFocus: true, merge: mergeNotifications });
  const [moreBusy, runMore] = useBusy();
  const [moreFailed, setMoreFailed] = useMoreFailed();
  const data = list.data;

  const loadMore = () =>
    runMore(async () => {
      const cursor = data?.nextCursor;
      if (!cursor) return;
      try {
        const r = await api<NotificationsResponse>(`${PATH}&cursor=${encodeURIComponent(cursor)}`);
        list.setData((prev) => (prev ? { ...r, unread: r.unread, items: [...prev.items, ...r.items.filter((x) => !prev.items.some((y) => y.id === x.id))] } : r));
      } catch (e) {
        setMoreFailed(true); // Sentinel sperren, sonst Endlosschleife
        toast.error(describeError(e));
      }
    });
  const sentinelRef = useInfiniteScroll({ hasMore: !!data?.nextCursor && !moreFailed, loading: moreBusy, onLoadMore: () => void loadMore() });

  /** Optimistisch als gelesen markieren (einzeln oder alle); bei Fehler nur die betroffenen Eintraege zurueck. */
  async function markRead(ids?: string[]) {
    if (!data) return;
    const now = new Date().toISOString();
    const hit = (id: string) => !ids || ids.includes(id);
    const changed = data.items.filter((n) => !n.readAt && hit(n.id)).map((n) => n.id);
    if (changed.length === 0 && ids) return;
    const changedSet = new Set(changed);
    list.setData((prev) =>
      prev && {
        ...prev,
        unread: ids ? Math.max(0, prev.unread - changed.length) : 0,
        items: prev.items.map((n) => (!n.readAt && (!ids || changedSet.has(n.id)) ? { ...n, readAt: now } : n)),
      },
    );
    try {
      await api("/notifications/read", { method: "POST", body: ids ? { ids } : {} });
    } catch (e) {
      // Nur die hier markierten Eintraege (Zeitstempel now) zuruecksetzen; nachgeladene/geaenderte bleiben
      list.setData((prev) =>
        prev && {
          ...prev,
          unread: prev.unread + prev.items.filter((n) => n.readAt === now).length,
          items: prev.items.map((n) => (n.readAt === now ? { ...n, readAt: null } : n)),
        },
      );
      toast.error(describeError(e));
    }
  }

  let content;
  if (list.error && !data) content = <ErrorState message={list.error} onRetry={list.reload} />;
  else if (!data) content = <ListSkeleton rows={5} />;
  else if (data.items.length === 0) content = <EmptyState icon={BellOff} title="Keine Benachrichtigungen.">Hier erscheinen neue Follower, Kommentare, Termine und Rechnungen.</EmptyState>;
  else
    content = (
      <Card flush>
        <ul className="divide-y divide-border">
          {data.items.map((n) => (
            <li key={n.id} className="flex items-stretch">
              <div className="min-w-0 flex-1">
                <NotificationRow n={n} onOpen={() => !n.readAt && void markRead([n.id])} />
              </div>
              {!n.readAt && (
                <button
                  type="button"
                  onClick={() => void markRead([n.id])}
                  aria-label={`Als gelesen markieren: ${describeNotification(n).text}`}
                  title="Als gelesen markieren"
                  className="inline-flex w-11 shrink-0 items-center justify-center text-muted hover:bg-surface-2 hover:text-text"
                >
                  <Check size={16} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    );

  return (
    <>
      <PageHeader
        title="Benachrichtigungen"
        subtitle={data ? (data.unread ? `${data.unread} ungelesen` : "Alles gelesen.") : undefined}
        action={
          <Button variant="secondary" disabled={!data?.unread} onClick={() => void markRead()}>
            Alle gelesen
          </Button>
        }
      />
      {content}
      {data?.nextCursor && <div ref={sentinelRef} aria-hidden />}
      {data?.nextCursor && (
        <div className="mt-4 text-center">
          <Button
            variant="secondary"
            busy={moreBusy}
            onClick={() => {
              setMoreFailed(false);
              void loadMore();
            }}
          >
            Mehr laden
          </Button>
        </div>
      )}
    </>
  );
}
