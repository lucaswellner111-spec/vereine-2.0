"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import type { FeedPost, OrgDetail } from "@vereine/shared";
import { PostCard } from "@/components/post-card";
import { Alert, Avatar, Badge, Button, Card } from "@/components/ui";
import { api, ApiError, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const roleLabel = { admin: "Vorstand", treasurer: "Kassenwart", moderator: "Moderation", member: "Mitglied" } as const;

export default function OrgPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user } = useAuth();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, p] = await Promise.all([
        api<OrgDetail>(`/orgs/${slug}`),
        api<{ posts: FeedPost[]; nextCursor: string | null }>(`/orgs/${slug}/posts`),
      ]);
      setOrg(o);
      setPosts(p.posts);
      setNext(p.nextCursor);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setError(describeError(e));
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<OrgDetail>) {
    setError(null);
    try {
      setOrg(await fn());
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function loadMore() {
    if (!next) return;
    try {
      const p = await api<{ posts: FeedPost[]; nextCursor: string | null }>(`/orgs/${slug}/posts?cursor=${encodeURIComponent(next)}`);
      setPosts((l) => [...(l ?? []), ...p.posts]);
      setNext(p.nextCursor);
    } catch (e) {
      setError(describeError(e));
    }
  }

  if (notFound) {
    return (
      <Card>
        <p className="text-sm">Dieser Verein existiert nicht.</p>
        <Link href="/vereine" className="mt-2 inline-block text-sm text-brand hover:underline">Zur Übersicht</Link>
      </Card>
    );
  }
  if (!org) return <p className="text-sm text-muted" role="status">{error ?? "Lade …"}</p>;

  const { viewer } = org;

  return (
    <>
      <Link href="/vereine" className="mb-3 inline-block text-sm text-muted hover:text-text">← Alle Vereine</Link>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={org.name} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">{org.name}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              {org.city} <Badge>{org.category}</Badge>
              {viewer.role && <Badge tone="brand">{roleLabel[viewer.role]}</Badge>}
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
                  if (!confirm("Mitgliedschaft wirklich beenden?")) return;
                  try {
                    await api(`/orgs/${slug}/members/${user!.id}`, { method: "DELETE" });
                    await load();
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
        {org.about && <p className="mt-4 text-sm">{org.about}</p>}
        <p className="mt-2 text-xs text-muted">{org.members} {org.members === 1 ? "Mitglied" : "Mitglieder"} · {org.followers} Follower</p>
      </Card>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <h2 className="mb-3 mt-6 font-semibold">Beiträge</h2>
      {posts === null ? (
        <p className="text-sm text-muted">Lade …</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Beiträge.{viewer.role === "admin" && " Schreibe den ersten im Feed („Posten als“)."}</p>
      ) : (
        <ul className="space-y-4">
          {posts.map((p) => (
            <li key={p.id}>
              <PostCard post={p} onDeleted={(id) => setPosts((l) => (l ?? []).filter((x) => x.id !== id))} />
            </li>
          ))}
        </ul>
      )}
      {next && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={loadMore}>Mehr laden</Button>
        </div>
      )}
    </>
  );
}
