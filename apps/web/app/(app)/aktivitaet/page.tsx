"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import type { ActivityPage, MyCommentItem, MyLikeItem, NotificationItem, NotificationsResponse } from "@vereine/shared";
import { ActivityRow, MyCommentRow, MyLikeRow } from "@/components/activity-row";
import { useNotificationHub } from "@/components/notification-hub";
import { Button, Card, EmptyState, ErrorState, ListSkeleton } from "@/components/ui";
import { LargeTitleHeader, PullIndicator, SegmentedControl, tabPanelProps } from "@/components/ui-client";
import { ask, toast } from "@/components/ui-hosts";
import { api, describeError } from "@/lib/api";
import { groupBySection, mergeNotifications, SECTION_LABELS } from "@/lib/notifications";
import { useApi, useBusy } from "@/lib/use-api";
import { useInfiniteScroll, useMoreFailed } from "@/lib/use-infinite-scroll";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";

type Tab = "benachrichtigungen" | "likes" | "kommentare";
const TABS = [
  { value: "benachrichtigungen" as const, label: "Benachrichtigungen" },
  { value: "likes" as const, label: "Gefällt mir" },
  { value: "kommentare" as const, label: "Kommentare" },
];
const ID_BASE = "aktivitaet";
const PANEL_ID = "aktivitaet-panel";

type Shell = { tabs: ReactNode; panel: Record<string, unknown> };

export default function ActivityPageView() {
  const [tab, setTab] = useState<Tab>("benachrichtigungen");
  const shell: Shell = {
    tabs: <SegmentedControl options={TABS} value={tab} onChange={setTab} aria-label="Aktivität" idBase={ID_BASE} panelId={PANEL_ID} fullWidth className="mb-4" />,
    panel: { ...tabPanelProps(ID_BASE, PANEL_ID, tab), className: "outline-offset-4" },
  };
  if (tab === "likes")
    return (
      <CursorPanel<MyLikeItem>
        shell={shell}
        path="/me/likes"
        title="Gefällt mir"
        subtitle="Beiträge, die du mit „Gefällt mir“ markiert hast."
        empty={<EmptyState emoji="🤍" title="Noch nichts geliked.">Beiträge, die dir gefallen, findest du hier wieder.</EmptyState>}
        timeOf={(i) => i.at}
        keyOf={(i) => i.postId}
        row={(i) => <MyLikeRow item={i} />}
      />
    );
  if (tab === "kommentare")
    return (
      <CursorPanel<MyCommentItem>
        shell={shell}
        path="/me/comments"
        title="Kommentare"
        subtitle="Deine Kommentare und Antworten."
        empty={<EmptyState emoji="💬" title="Noch nichts kommentiert.">Deine Kommentare und Antworten erscheinen hier.</EmptyState>}
        timeOf={(i) => i.at}
        keyOf={(i) => i.id}
        row={(i) => <MyCommentRow item={i} />}
      />
    );
  return <NotificationsPanel shell={shell} />;
}

/** Liste in Abschnitten Heute / Diese Woche / Frueher; jeder Abschnitt eine Karte mit Ueberschrift. */
function Sections<T>({ items, timeOf, keyOf, row }: { items: T[]; timeOf: (i: T) => string; keyOf: (i: T) => string; row: (i: T) => ReactNode }) {
  return (
    <div className="space-y-5">
      {groupBySection(items, timeOf).map((g) => (
        <section key={g.section} aria-labelledby={`sec-${g.section}`}>
          <h2 id={`sec-${g.section}`} className="mb-2 px-1 text-sm font-semibold text-muted">
            {SECTION_LABELS[g.section]}
          </h2>
          <Card flush className="overflow-hidden">
            <ul className="divide-y divide-border">
              {g.items.map((i) => (
                <li key={keyOf(i)}>{row(i)}</li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}

function MoreButton({ visible, busy, onClick, sentinel }: { visible: boolean; busy: boolean; onClick: () => void; sentinel: (el: Element | null) => void }) {
  if (!visible) return null;
  return (
    <Fragment>
      <div ref={sentinel} aria-hidden />
      <div className="mt-4 text-center">
        <Button variant="secondary" busy={busy} onClick={onClick}>
          Mehr laden
        </Button>
      </div>
    </Fragment>
  );
}

/** Eigene Likes bzw. Kommentare: Keyset-Paging, Endlos-Scroll mit "Mehr laden" als Rueckfall. */
function CursorPanel<T>({
  shell,
  path,
  title,
  subtitle,
  empty,
  timeOf,
  keyOf,
  row,
}: {
  shell: Shell;
  path: string;
  title: string;
  subtitle: string;
  empty: ReactNode;
  timeOf: (i: T) => string;
  keyOf: (i: T) => string;
  row: (i: T) => ReactNode;
}) {
  const list = useApi<ActivityPage<T>>(path, { refreshOnFocus: true });
  const [moreBusy, runMore] = useBusy();
  const [moreFailed, setMoreFailed] = useMoreFailed();
  const data = list.data;
  const ptr = usePullToRefresh(list.reload);
  const loadMore = () =>
    runMore(async () => {
      const cursor = data?.nextCursor;
      if (!cursor) return;
      try {
        const r = await api<ActivityPage<T>>(`${path}?cursor=${encodeURIComponent(cursor)}`);
        list.setData((prev) => (prev ? { nextCursor: r.nextCursor, items: [...prev.items, ...r.items.filter((x) => !prev.items.some((y) => keyOf(y) === keyOf(x)))] } : r));
      } catch (e) {
        setMoreFailed(true);
        toast.error(describeError(e));
      }
    });
  const sentinel = useInfiniteScroll({ hasMore: !!data?.nextCursor && !moreFailed, loading: moreBusy, onLoadMore: () => void loadMore() });

  let content: ReactNode;
  if (list.error && !data) content = <ErrorState message={list.error} onRetry={list.reload} />;
  else if (!data) content = <ListSkeleton rows={5} />;
  else if (data.items.length === 0) content = empty;
  else content = <Sections items={data.items} timeOf={timeOf} keyOf={keyOf} row={row} />;
  return (
    <>
      <PullIndicator {...ptr} />
      <LargeTitleHeader title={title} subtitle={subtitle} />
      {shell.tabs}
      <div {...shell.panel}>
        {content}
        <MoreButton
          visible={!!data?.nextCursor}
          busy={moreBusy}
          sentinel={sentinel}
          onClick={() => {
            setMoreFailed(false);
            void loadMore();
          }}
        />
      </div>
    </>
  );
}

function NotificationsPanel({ shell }: { shell: Shell }) {
  const hub = useNotificationHub();
  const list = useApi<NotificationsResponse>("/notifications?limit=30", { refreshOnFocus: true, merge: mergeNotifications });
  const [moreBusy, runMore] = useBusy();
  const [moreFailed, setMoreFailed] = useMoreFailed();
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const data = list.data;
  const ptr = usePullToRefresh(list.reload);

  // Live-Ereignis (oder Rueckfall-Polling): still aktualisieren
  const { refresh } = list;
  useEffect(() => {
    if (hub.version > 0) refresh();
  }, [hub.version, refresh]);

  const loadMore = () =>
    runMore(async () => {
      const cursor = data?.nextCursor;
      if (!cursor) return;
      try {
        const r = await api<NotificationsResponse>(`/notifications?limit=30&cursor=${encodeURIComponent(cursor)}`);
        list.setData((prev) => (prev ? { ...r, unread: r.unread, items: [...prev.items, ...r.items.filter((x) => !prev.items.some((y) => y.id === x.id))] } : r));
      } catch (e) {
        setMoreFailed(true); // Sentinel sperren, sonst Endlosschleife
        toast.error(describeError(e));
      }
    });
  const sentinel = useInfiniteScroll({ hasMore: !!data?.nextCursor && !moreFailed, loading: moreBusy, onLoadMore: () => void loadMore() });

  /** Optimistisch als gelesen markieren (einzeln oder alle); bei Fehler nur die betroffenen Eintraege zurueck. */
  async function markRead(ids?: string[]) {
    if (!data) return;
    const now = new Date().toISOString();
    const hit = (id: string) => !ids || ids.includes(id);
    const changed = data.items.filter((n) => !n.readAt && hit(n.id)).map((n) => n.id);
    if (changed.length === 0 && ids) return;
    const changedSet = new Set(changed);
    list.setData(
      (prev) =>
        prev && {
          ...prev,
          unread: ids ? Math.max(0, prev.unread - changed.length) : 0,
          items: prev.items.map((n) => (!n.readAt && (!ids || changedSet.has(n.id)) ? { ...n, readAt: now } : n)),
        },
    );
    try {
      await api("/notifications/read", { method: "POST", body: ids ? { ids } : {} });
      hub.refresh();
    } catch (e) {
      list.setData(
        (prev) =>
          prev && {
            ...prev,
            unread: prev.unread + prev.items.filter((n) => n.readAt === now).length,
            items: prev.items.map((n) => (n.readAt === now ? { ...n, readAt: null } : n)),
          },
      );
      toast.error(describeError(e));
    }
  }

  /** Ausblenden = Benachrichtigung loeschen (Wischen oder Knopf); sofort weg, bei Fehler zurueck. */
  async function hide(n: NotificationItem) {
    const before = data;
    list.setData((prev) => prev && { ...prev, unread: n.readAt ? prev.unread : Math.max(0, prev.unread - 1), items: prev.items.filter((x) => x.id !== n.id) });
    try {
      await api(`/notifications/${n.id}`, { method: "DELETE" });
      hub.refresh();
    } catch (e) {
      list.setData(before);
      toast.error(describeError(e));
    }
  }

  async function toggleFollow(actorId: string, handle: string, current: "none" | "requested" | "following") {
    if (current === "following" && !(await ask("Nicht mehr folgen?", { confirmLabel: "Entfolgen" }))) return;
    setFollowBusy(actorId);
    try {
      const updated = await api<{ viewer: { follow: "none" | "requested" | "following" } }>(`/profiles/${handle}/follow`, current === "none" ? { method: "POST", body: {} } : { method: "DELETE" });
      const next = updated.viewer.follow;
      list.setData(
        (prev) =>
          prev && {
            ...prev,
            items: prev.items.map((n) => (n.actors?.some((a) => a.id === actorId) ? { ...n, actors: n.actors.map((a) => (a.id === actorId && a.following ? { ...a, following: next } : a)) } : n)),
          },
      );
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setFollowBusy(null);
    }
  }

  let content: ReactNode;
  if (list.error && !data) content = <ErrorState message={list.error} onRetry={list.reload} />;
  else if (!data) content = <ListSkeleton rows={5} />;
  else if (data.items.length === 0)
    content = (
      <EmptyState emoji="🔔" title="Keine Benachrichtigungen.">
        Hier erscheinen Likes, Kommentare, Erwähnungen, neue Follower, Termine und Rechnungen.
      </EmptyState>
    );
  else
    content = (
      <Sections
        items={data.items}
        timeOf={(n) => n.createdAt}
        keyOf={(n) => n.id}
        row={(n) => <ActivityRow n={n} onOpen={() => !n.readAt && void markRead([n.id])} onHide={() => void hide(n)} onFollow={toggleFollow} followBusy={n.actors?.[0]?.id === followBusy} />}
      />
    );

  return (
    <>
      <PullIndicator {...ptr} />
      <LargeTitleHeader
        title="Aktivität"
        subtitle={data ? (data.unread ? `${data.unread} ungelesen` : "Alles gelesen.") : undefined}
        action={
          <Button variant="secondary" disabled={!data?.unread} onClick={() => void markRead()}>
            Alle gelesen
          </Button>
        }
      />
      {shell.tabs}
      <div {...shell.panel}>
        {content}
        <MoreButton
          visible={!!data?.nextCursor}
          busy={moreBusy}
          sentinel={sentinel}
          onClick={() => {
            setMoreFailed(false);
            void loadMore();
          }}
        />
      </div>
    </>
  );
}
