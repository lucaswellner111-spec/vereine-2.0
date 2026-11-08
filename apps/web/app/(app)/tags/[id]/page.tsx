"use client";

import Link from "next/link";
import { Hash, SearchX } from "lucide-react";
import { use, useRef } from "react";
import { isTagId, TAGS, type FeedResponse, type OrgSummary } from "@vereine/shared";
import { PostCard } from "@/components/post-card";
import { ArrowLink, Avatar, Button, CardSkeletons, EmptyState, ErrorState, ListSkeleton, PageHeader, SectionTitle } from "@/components/ui";
import { BackButton } from "@/components/ui-client";
import { toast } from "@/components/ui-hosts";
import { api, describeError } from "@/lib/api";
import { useApi, useBusy } from "@/lib/use-api";
import { useInfiniteScroll, useMoreFailed } from "@/lib/use-infinite-scroll";
import { usePageTitle } from "@/lib/use-page-title";

/** Tag-Seite: Vereine mit diesem Tag und passende Beitraege (chronologisch, Endlos-Liste). */
export default function TagPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = use(params);
  const id = decodeURIComponent(raw);
  const def = TAGS.find((t) => t.id === id);
  usePageTitle(def?.label ?? null);

  if (!def || !isTagId(id)) {
    return (
      <div className="mx-auto max-w-2xl">
        <BackButton fallback="/feed" className="mb-3">Zurück</BackButton>
        <EmptyState icon={SearchX} title="Diesen Tag gibt es nicht." action={<ArrowLink href="/vereine">Vereine entdecken</ArrowLink>}>
          Tags stammen aus einer festen Liste von Sportarten und Themen.
        </EmptyState>
      </div>
    );
  }
  return <TagContent id={id} label={def.label} group={def.group} />;
}

function TagContent({ id, label, group }: { id: string; label: string; group: string }) {
  const orgs = useApi<OrgSummary[]>(`/orgs?tag=${encodeURIComponent(id)}`);
  const path = `/feed?mode=chrono&tag=${encodeURIComponent(id)}`;
  const feed = useApi<FeedResponse>(path);
  const pathRef = useRef(path);
  pathRef.current = path;
  const [moreBusy, runMore] = useBusy();
  const [moreFailed, setMoreFailed] = useMoreFailed(path);

  const loadMore = () =>
    runMore(async () => {
      const cursor = feed.data?.nextCursor;
      if (!cursor) return;
      const requested = path;
      try {
        const res = await api<FeedResponse>(`${requested}&cursor=${encodeURIComponent(cursor)}`);
        if (pathRef.current !== requested) return;
        feed.setData((prev) => {
          if (!prev) return res;
          const known = new Set(prev.posts.map((p) => p.id));
          return { ...res, posts: [...prev.posts, ...res.posts.filter((p) => !known.has(p.id))] };
        });
      } catch (e) {
        setMoreFailed(true);
        toast.error(describeError(e));
      }
    });
  const sentinelRef = useInfiniteScroll({ hasMore: !!feed.data?.nextCursor && !moreFailed, loading: moreBusy, onLoadMore: () => void loadMore() });
  const dropPost = (postId: string) => feed.setData((f) => (f ? { ...f, posts: f.posts.filter((p) => p.id !== postId) } : f));

  let orgList;
  if (orgs.error && !orgs.data) orgList = <ErrorState message={orgs.error} onRetry={orgs.reload} />;
  else if (!orgs.data) orgList = <ListSkeleton rows={2} />;
  else if (!orgs.data.length) orgList = <p className="text-sm text-muted">Noch kein Verein mit diesem Tag.</p>;
  else
    orgList = (
      <ul className="flex gap-3 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-visible">
        {orgs.data.map((o) => (
          <li key={o.slug} className="shrink-0">
            <Link href={`/vereine/${o.slug}`} className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2">
              <Avatar name={o.name} size={32} mediaId={o.logoId} kind="org" />
              <span className="min-w-0">
                <span className="block max-w-48 truncate font-medium">{o.name}</span>
                <span className="block text-xs text-muted">{o.city}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );

  let posts;
  if (feed.error && !feed.data) posts = <ErrorState message={feed.error} onRetry={feed.reload} />;
  else if (!feed.data) posts = <CardSkeletons count={2} />;
  else if (!feed.data.posts.length) posts = <EmptyState icon={Hash} title="Noch keine Beiträge mit diesem Tag." />;
  else
    posts = (
      <ul className="space-y-4">
        {feed.data.posts.map((p) => (
          <li key={p.id}>
            <PostCard post={p} onDeleted={dropPost} onHidden={dropPost} />
          </li>
        ))}
      </ul>
    );

  return (
    <div className="mx-auto max-w-2xl">
      <BackButton fallback="/feed" className="mb-3">Zurück</BackButton>
      <PageHeader title={label} subtitle={group} />
      <section aria-labelledby="tag-orgs" className="mb-6">
        <SectionTitle className="mb-3">
          <span id="tag-orgs">Vereine</span>
        </SectionTitle>
        {orgList}
      </section>
      <section aria-labelledby="tag-posts">
        <SectionTitle className="mb-3">
          <span id="tag-posts">Beiträge</span>
        </SectionTitle>
        {posts}
        {feed.data?.nextCursor && <div ref={sentinelRef} aria-hidden />}
        {feed.data?.nextCursor && (
          <div className="mt-4 text-center">
            <Button variant="secondary" busy={moreBusy} onClick={() => { setMoreFailed(false); void loadMore(); }}>Mehr laden</Button>
          </div>
        )}
      </section>
    </div>
  );
}
