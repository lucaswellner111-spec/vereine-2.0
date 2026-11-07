"use client";

import { use, useRef, useState } from "react";
import { MAX_ORG_TAGS, type FeedPost, type OrgDetail } from "@vereine/shared";
import { TagChips } from "@/components/tag-chips";
import { TagPicker } from "@/components/tag-picker";
import { PostCard } from "@/components/post-card";
import { Alert, ArrowLink, Avatar, BackLink, Badge, Button, Card, CardSkeletons, EmptyState, ErrorState } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";
import { useApi, useBusy } from "@/lib/use-api";
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
  const [error, setError] = useState<string | null>(null);
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
        toast.error(describeError(e));
      }
    });

  if (org.errorStatus === 404) {
    return <EmptyState title="Dieser Verein existiert nicht." action={<ArrowLink href="/vereine">Zur Übersicht</ArrowLink>} />;
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
            <PostCard post={p} onDeleted={dropPost} />
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <BackLink href="/vereine">Alle Vereine</BackLink>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={o.name} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">{o.name}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              {o.city} <Badge>{o.category}</Badge>
              {viewer.role && <Badge tone="brand">{ROLE_LABEL[viewer.role]}</Badge>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={viewer.following ? "secondary" : "primary"}
              onClick={() => act(() => api<OrgDetail>(`/orgs/${slug}/follow`, viewer.following ? { method: "DELETE" } : { method: "POST", body: {} }))}
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
                  if (!(await ask("Mitgliedschaft wirklich beenden?", { confirmLabel: "Austreten" }))) return;
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
          </div>
        </div>
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

      <h2 className="mb-3 mt-6 font-semibold">Beiträge</h2>
      {postList}
      {posts.data?.nextCursor && (
        <div className="mt-4 text-center">
          <Button variant="secondary" busy={moreBusy} onClick={loadMore}>Mehr laden</Button>
        </div>
      )}
    </>
  );
}
