"use client";

import { use, useRef, useState } from "react";
import { MAX_ORG_TAGS, type FeedPost, type OrgDetail } from "@vereine/shared";
import { TagChips } from "@/components/tag-chips";
import { LazyTagPicker as TagPicker } from "@/components/lazy";
import { PostCard } from "@/components/post-card";
import { Building2 } from "lucide-react";
import { Alert, ArrowLink, Avatar, BackLink, Badge, Button, Card, CardSkeletons, DetailHeader, EmptyState, ErrorState, SectionTitle } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";
import { useApi, useBusy } from "@/lib/use-api";
import { useInfiniteScroll, useMoreFailed } from "@/lib/use-infinite-scroll";
import { usePageTitle } from "@/lib/use-page-title";
import { ask, toast } from "@/components/ui-hosts";

type PostsPage = { posts: FeedPost[]; nextCursor: string | null };

export default function OrgPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user } = useAuth();
  const org = useApi<OrgDetail>(`/orgs/${slug}`);
  const postsPath = `/orgs/${slug}/posts`;
  const posts = useApi<PostsPage>(postsPath);
  const pathRef = useRef(postsPath);
  pathRef.current = postsPath;
  const [moreBusy, runMore] = useBusy();
  const [moreFailed, setMoreFailed] = useMoreFailed(postsPath);
  const [followBusy, runFollow] = useBusy();
  const [error, setError] = useState<string | null>(null);
  usePageTitle(org.data?.name ?? null);
  const [editTags, setEditTags] = useState<string[] | null>(null);

  async function act(fn: () => Promise<OrgDetail>) {
    setError(null);
    try {
      org.setData(await fn());
    } catch (e) {
      setError(describeError(e));
    }
  }

  const loadMore = () =>
    runMore(async () => {
      const cursor = posts.data?.nextCursor;
      if (!cursor) return;
      const requested = postsPath;
      try {
        const p = await api<PostsPage>(`${requested}?cursor=${encodeURIComponent(cursor)}`);
        if (pathRef.current !== requested) return;
        posts.setData((prev) => (prev ? { ...p, posts: [...prev.posts, ...p.posts] } : p));
      } catch (e) {
        setMoreFailed(true); // Sentinel sperren, sonst Endlosschleife
        toast.error(describeError(e));
      }
    });
  const sentinelRef = useInfiniteScroll({ hasMore: !!posts.data?.nextCursor && !moreFailed, loading: moreBusy, onLoadMore: () => void loadMore() });

  // Optimistisch folgen/entfolgen; bei Fehler zurueck
  const toggleFollow = () =>
    runFollow(async () => {
      const o = org.data;
      if (!o) return;
      const following = o.viewer.following;
      setError(null);
      org.setData({ ...o, followers: Math.max(0, o.followers + (following ? -1 : 1)), viewer: { ...o.viewer, following: !following } });
      try {
        org.setData(await api<OrgDetail>(`/orgs/${slug}/follow`, following ? { method: "DELETE" } : { method: "POST", body: {} }));
      } catch (e) {
        org.setData(o);
        toast.error(describeError(e));
      }
    });

  if (org.errorStatus === 404) {
    return <EmptyState icon={Building2} title="Dieser Verein existiert nicht." action={<ArrowLink href="/vereine">Zur Übersicht</ArrowLink>} />;
  }
  if (org.error && !org.data) return <ErrorState message={org.error} onRetry={org.reload} />;
  if (!org.data) return <CardSkeletons count={1} />;

  const o = org.data;
  const { viewer } = o;
  const dropPost = (id: string) => posts.setData((d) => (d ? { ...d, posts: d.posts.filter((x) => x.id !== id) } : d));

  let postList;
  if (posts.error && !posts.data) postList = <ErrorState message={posts.error} onRetry={posts.reload} />;
  else if (!posts.data) postList = <CardSkeletons count={2} />;
  else if (!posts.data.posts.length)
    postList = <EmptyState title="Noch keine Beiträge.">{viewer.role === "admin" ? "Schreibe den ersten im Feed („Posten als“)." : undefined}</EmptyState>;
  else
    postList = (
      <ul className="space-y-4">
        {posts.data.posts.map((p) => (
          <li key={p.id}>
            <PostCard post={p} onDeleted={dropPost} onHidden={dropPost} />
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <BackLink href="/vereine">Alle Vereine</BackLink>
      <Card className="mb-4">
        <DetailHeader
          media={<Avatar name={o.name} size={64} />}
          title={o.name}
          subtitle={
            <span className="flex flex-wrap items-center gap-2">
              {o.city} <Badge>{o.category}</Badge>
              {viewer.role && <Badge tone="brand">{ROLE_LABEL[viewer.role]}</Badge>}
            </span>
          }
          actions={
          <>
            <Button
              variant={viewer.following ? "secondary" : "primary"}
              aria-busy={followBusy || undefined}
              onClick={toggleFollow}
            >
              {viewer.following ? "Du folgst" : "Folgen"}
            </Button>
            {viewer.membership === "none" && (
              <Button variant="secondary" onClick={() => act(() => api<OrgDetail>(`/orgs/${slug}/membership`, { method: "POST", body: {} }))}>
                Mitglied werden
              </Button>
            )}
            {viewer.membership === "pending" && <Badge tone="accent">Antrag wartet auf Freigabe</Badge>}
            {viewer.membership === "active" && viewer.role !== "admin" && (
              <Button
                variant="ghost"
                onClick={async () => {
                  if (!(await ask("Mitgliedschaft wirklich beenden? Du verlierst den Zugriff auf interne Termine und Chats des Vereins.", { title: "Austreten?", confirmLabel: "Austreten", danger: true }))) return;
                  setError(null);
                  try {
                    await api(`/orgs/${slug}/members/${user!.id}`, { method: "DELETE" });
                    org.reload();
                    posts.reload();
                  } catch (e) {
                    setError(describeError(e));
                  }
                }}
              >
                Austreten
              </Button>
            )}
          </>
          }
        />
        {o.about && <p className="mt-4 text-sm">{o.about}</p>}
        {editTags === null ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TagChips tags={o.tags} to="/vereine" />
            {viewer.role === "admin" && (
              <button type="button" onClick={() => setEditTags(o.tags)} className="text-xs font-medium text-brand hover:underline">
                {o.tags.length ? "Tags bearbeiten" : "Sportarten und Themen festlegen"}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <TagPicker label="Sportarten und Themen" value={editTags} onChange={setEditTags} max={MAX_ORG_TAGS} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => act(async () => { const r = await api<OrgDetail>(`/orgs/${slug}/tags`, { method: "PUT", body: { tags: editTags } }); setEditTags(null); return r; })}>Speichern</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditTags(null)}>Abbrechen</Button>
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">{o.members} {o.members === 1 ? "Mitglied" : "Mitglieder"} · {o.followers} Follower</p>
      </Card>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <SectionTitle className="mb-3 mt-6">Beiträge</SectionTitle>
      {postList}
      {posts.data?.nextCursor && <div ref={sentinelRef} aria-hidden />}
      {posts.data?.nextCursor && (
        <div className="mt-4 text-center">
          <Button variant="secondary" busy={moreBusy} onClick={() => { setMoreFailed(false); void loadMore(); }}>Mehr laden</Button>
        </div>
      )}
    </>
  );
}
