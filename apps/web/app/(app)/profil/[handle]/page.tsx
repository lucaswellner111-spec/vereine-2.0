"use client";

import clsx from "clsx";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import type { FeedPost, PersonItem, ProfileView } from "@vereine/shared";
import { PostCard } from "@/components/post-card";
import { Alert, Avatar, Badge, Button, Card } from "@/components/ui";
import { api, ApiError, describeError } from "@/lib/api";
import { mediaUrl } from "@/lib/media";

type Tab = "Fotos" | "Beiträge" | "Follower" | "Folgt";

export default function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [people, setPeople] = useState<PersonItem[] | null>(null);
  const [tab, setTab] = useState<Tab>("Fotos");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [open, setOpen] = useState<{ post: FeedPost; index: number } | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      setProfile(await api<ProfileView>(`/profiles/${handle}`));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 400)) setNotFound(true);
      else setError(describeError(e));
    }
  }, [handle]);

  const loadPosts = useCallback(
    async (cursor?: string) => {
      try {
        const r = await api<{ posts: FeedPost[]; nextCursor: string | null; locked: boolean }>(`/profiles/${handle}/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
        setPosts((prev) => (cursor && prev ? [...prev, ...r.posts] : r.posts));
        setNext(r.nextCursor);
      } catch (e) {
        setError(describeError(e));
      }
    },
    [handle],
  );

  useEffect(() => {
    setProfile(null);
    setPosts(null);
    setNotFound(false);
    setTab("Fotos");
    void loadProfile();
    void loadPosts();
  }, [loadProfile, loadPosts]);

  useEffect(() => {
    if (tab !== "Follower" && tab !== "Folgt") return;
    setPeople(null);
    api<PersonItem[]>(`/profiles/${handle}/${tab === "Follower" ? "followers" : "following"}`).then(setPeople).catch((e) => setError(describeError(e)));
  }, [tab, handle]);

  async function toggleFollow() {
    if (!profile) return;
    setError(null);
    try {
      const following = profile.viewer.follow !== "none";
      const updated = await api<ProfileView>(`/profiles/${handle}/follow`, following ? { method: "DELETE" } : { method: "POST", body: {} });
      setProfile(updated);
      if (updated.viewer.canView) void loadPosts();
    } catch (e) {
      setError(describeError(e));
    }
  }

  if (notFound) {
    return (
      <Card>
        <p className="text-sm">Dieses Profil gibt es nicht.</p>
        <Link href="/personen" className="mt-2 inline-block text-sm text-brand hover:underline">Personen suchen</Link>
      </Card>
    );
  }
  if (!profile) return <p className="text-sm text-muted" role="status">{error ?? "Lade …"}</p>;

  const v = profile.viewer;
  const withMedia = (posts ?? []).filter((p) => p.media.length > 0);
  const tabs: Tab[] = ["Fotos", "Beiträge", "Follower", "Folgt"];

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-start gap-4 sm:gap-6">
          <Avatar name={profile.displayName} size={96} mediaId={profile.avatarId} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{profile.displayName}</h1>
              {profile.visibility === "private" && <Badge>privat</Badge>}
            </div>
            <p className="text-sm text-muted">@{profile.handle}{profile.location && ` · ${profile.location}`}</p>
            <ul className="mt-3 flex gap-5 text-sm">
              <li><strong>{profile.counts.posts}</strong> <span className="text-muted">Beiträge</span></li>
              <li><button type="button" onClick={() => setTab("Follower")} className="hover:underline"><strong>{profile.counts.followers}</strong> <span className="text-muted">Follower</span></button></li>
              <li><button type="button" onClick={() => setTab("Folgt")} className="hover:underline"><strong>{profile.counts.following}</strong> <span className="text-muted">Folgt</span></button></li>
            </ul>
          </div>
          <div className="flex gap-2">
            {v.isMe ? (
              <Link href="/einstellungen/profil" className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2">Profil bearbeiten</Link>
            ) : (
              <Button variant={v.follow === "none" ? "primary" : "secondary"} onClick={toggleFollow}>
                {v.follow === "following" ? "Du folgst" : v.follow === "requested" ? "Angefragt" : "Folgen"}
              </Button>
            )}
          </div>
        </div>
        {profile.bio && <p className="mt-4 whitespace-pre-wrap break-words text-sm">{profile.bio}</p>}
        {profile.clubs && profile.clubs.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Vereine">
            {profile.clubs.map((c) => (
              <li key={c.slug}>
                <Link href={`/vereine/${c.slug}`} className="inline-flex items-center rounded-full bg-surface-2 px-3 py-1 text-xs text-muted hover:text-text">{c.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div role="tablist" className="mb-4 inline-flex rounded-lg border border-border bg-surface p-1">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={clsx("rounded-md px-3 py-1.5 text-sm font-medium", tab === t ? "bg-brand text-brand-contrast" : "text-muted hover:text-text")}>
            {t}
          </button>
        ))}
      </div>

      {!v.canView && (tab === "Fotos" || tab === "Beiträge") ? (
        <Card><p className="text-sm">🔒 Dieses Profil ist privat. Folge {profile.displayName}, um die Beiträge zu sehen.</p></Card>
      ) : tab === "Fotos" ? (
        posts === null ? <p className="text-sm text-muted" role="status">Lade …</p> : withMedia.length === 0 ? (
          <Card><p className="text-sm text-muted">Noch keine Fotos.</p></Card>
        ) : (
          <ul className="grid grid-cols-3 gap-1 sm:gap-2">
            {withMedia.map((p) => (
              <li key={p.id} className="relative aspect-square overflow-hidden rounded-md bg-surface-2">
                <button type="button" className="block h-full w-full" aria-label={`Foto-Beitrag öffnen: ${p.body.slice(0, 40) || "ohne Text"}`} onClick={() => setOpen({ post: p, index: 0 })}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(p.media[0].id, "thumb")} alt="" loading="lazy" className="h-full w-full object-cover" />
                  {p.media.length > 1 && <span className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-[10px] text-white">⧉ {p.media.length}</span>}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : tab === "Beiträge" ? (
        posts === null ? <p className="text-sm text-muted" role="status">Lade …</p> : posts.length === 0 ? (
          <Card><p className="text-sm text-muted">Noch keine Beiträge.</p></Card>
        ) : (
          <ul className="space-y-4">
            {posts.map((p) => (
              <li key={p.id}><PostCard post={p} onDeleted={(id) => setPosts((l) => (l ?? []).filter((x) => x.id !== id))} onHidden={(id) => setPosts((l) => (l ?? []).filter((x) => x.id !== id))} /></li>
            ))}
          </ul>
        )
      ) : people === null ? (
        <p className="text-sm text-muted" role="status">Lade …</p>
      ) : people.length === 0 ? (
        <Card><p className="text-sm text-muted">{v.canView ? "Noch niemand." : "🔒 Die Liste ist nur für Follower sichtbar."}</p></Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {people.map((p) => (
            <Link key={p.userId} href={`/profil/${p.handle}`} className="flex items-center gap-3 p-3 hover:bg-surface-2">
              <Avatar name={p.displayName} mediaId={p.avatarId} />
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{p.displayName}</span><span className="block truncate text-xs text-muted">@{p.handle}</span></span>
            </Link>
          ))}
        </Card>
      )}

      {(tab === "Fotos" || tab === "Beiträge") && next && v.canView && (
        <div className="mt-4 text-center"><Button variant="secondary" onClick={() => loadPosts(next)}>Mehr laden</Button></div>
      )}

      {open && (
        open.post.media.length > 0 && (
          <div role="dialog" aria-modal="true" aria-label="Beitrag" className="fixed inset-0 z-40 overflow-y-auto bg-black/70 p-4" onClick={() => setOpen(null)}>
            <div className="mx-auto max-w-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 text-right"><Button variant="secondary" size="sm" onClick={() => setOpen(null)}>Schließen</Button></div>
              <PostCard post={open.post} onDeleted={(id) => { setPosts((l) => (l ?? []).filter((x) => x.id !== id)); setOpen(null); }} onHidden={() => setOpen(null)} />
            </div>
          </div>
        )
      )}
    </>
  );
}
