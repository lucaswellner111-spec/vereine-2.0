"use client";

import { Images, Lock, UserX } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useRef, useState, type ReactNode } from "react";
import type { FeedPost, PersonItem, ProfileMediaPage, ProfileView } from "@vereine/shared";
import { PostCard } from "@/components/post-card";
import { Alert, ArrowLink, Avatar, Badge, Button, Card, CardSkeletons, DetailHeader, EmptyState, ErrorState, LinkButton, ListSkeleton } from "@/components/ui";
import { BackButton, Dialog, SegmentedControl, tabPanelProps } from "@/components/ui-client";
import { toast } from "@/components/ui-hosts";
import { api, describeError } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import { optimisticFollow } from "@/lib/follow";
import { useApi, useBusy, type ApiState } from "@/lib/use-api";
import { useInfiniteScroll, useMoreFailed } from "@/lib/use-infinite-scroll";
import { usePageTitle } from "@/lib/use-page-title";

type Tab = "fotos" | "beitraege" | "follower" | "folgt";
const TABS: { value: Tab; label: string }[] = [
  { value: "fotos", label: "Fotos" },
  { value: "beitraege", label: "Beiträge" },
  { value: "follower", label: "Follower" },
  { value: "folgt", label: "Folgt" },
];
type PostsPage = { posts: FeedPost[]; nextCursor: string | null; locked: boolean };

export default function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const profile = useApi<ProfileView>(`/profiles/${handle}`);
  const postsPath = `/profiles/${handle}/posts`;
  const posts = useApi<PostsPage>(postsPath);
  const mediaPath = `/profiles/${handle}/media`;
  const photos = useApi<ProfileMediaPage>(mediaPath);
  const pathRef = useRef(handle);
  pathRef.current = handle;
  const [moreBusy, runMore] = useBusy();
  const [followBusy, runFollow] = useBusy();
  usePageTitle(profile.data?.displayName ?? null);
  const [tab, setTab] = useState<Tab>("fotos");
  const [moreFailed, setMoreFailed] = useMoreFailed(`${handle}/${tab}`);
  const peopleTab = tab === "follower" || tab === "folgt";
  const people = useApi<PersonItem[]>(peopleTab ? `/profiles/${handle}/${tab === "follower" ? "followers" : "following"}` : null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<FeedPost | null>(null);

  // Neues Profil: wieder mit Fotos beginnen
  useEffect(() => {
    setTab("fotos");
    setOpen(null);
  }, [handle]);

  /** Naechste Seite der Beitraege bzw. Fotos anhaengen (Cursor-Paging). */
  const appendPage = <P extends { posts: FeedPost[]; nextCursor: string | null }>(state: ApiState<P>, path: string) =>
    runMore(async () => {
      const cursor = state.data?.nextCursor;
      if (!cursor) return;
      const requested = handle;
      try {
        const r = await api<P>(`${path}?cursor=${encodeURIComponent(cursor)}`);
        if (pathRef.current !== requested) return;
        state.setData((prev) => (prev ? { ...r, posts: [...prev.posts, ...r.posts.filter((x) => !prev.posts.some((y) => y.id === x.id))] } : r));
      } catch (e) {
        setMoreFailed(true); // Sentinel sperren, sonst Endlosschleife
        toast.error(describeError(e));
      }
    });
  const pagedTab = tab === "fotos" ? photos : tab === "beitraege" ? posts : null;
  const loadMore = () => (tab === "fotos" ? appendPage(photos, mediaPath) : appendPage(posts, postsPath));
  const sentinelRef = useInfiniteScroll({ hasMore: !!pagedTab?.data?.nextCursor && !moreFailed, loading: moreBusy, onLoadMore: () => void loadMore() });

  // Optimistisch: sofort umschalten, bei Fehler zurueck; useBusy verhindert Doppelklicks
  const toggleFollow = () =>
    runFollow(async () => {
      const p = profile.data;
      if (!p) return;
      setError(null);
      profile.setData(optimisticFollow(p));
      try {
        const following = p.viewer.follow !== "none";
        const updated = await api<ProfileView>(`/profiles/${handle}/follow`, following ? { method: "DELETE" } : { method: "POST", body: {} });
        profile.setData(updated);
        if (updated.viewer.canView !== p.viewer.canView) {
          posts.reload();
          photos.reload();
        }
      } catch (e) {
        profile.setData(p);
        toast.error(describeError(e));
      }
    });

  const dropPost = (id: string) => {
    const drop = <P extends { posts: FeedPost[] }>(d: P | null) => (d ? { ...d, posts: d.posts.filter((x) => x.id !== id) } : d);
    posts.setData(drop);
    photos.setData(drop);
  };

  if (profile.errorStatus === 404 || profile.errorStatus === 400) {
    return <EmptyState icon={UserX} title="Dieses Profil gibt es nicht." action={<ArrowLink href="/personen">Personen suchen</ArrowLink>} />;
  }
  if (profile.error && !profile.data) return <ErrorState message={profile.error} onRetry={profile.reload} />;
  if (!profile.data) return <CardSkeletons count={1} />;

  const p = profile.data;
  const v = p.viewer;
  const list = posts.data?.posts ?? null;

  const pageBody = (state: Pick<ApiState<{ posts: FeedPost[] }>, "data" | "error" | "reload">, render: (items: FeedPost[]) => ReactNode) =>
    state.error && !state.data ? <ErrorState message={state.error} onRetry={state.reload} /> : state.data === null ? <CardSkeletons count={2} /> : render(state.data.posts);

  let content;
  if (!v.canView && (tab === "fotos" || tab === "beitraege")) {
    content = <EmptyState icon={Lock} title="Dieses Profil ist privat.">Folge {p.displayName}, um die Beiträge zu sehen.</EmptyState>;
  } else if (tab === "fotos") {
    content = pageBody(photos, (withMedia) =>
      withMedia.length === 0 ? (
        <EmptyState title="Noch keine Fotos." />
      ) : (
        <ul className="grid grid-cols-3 gap-1 sm:gap-2">
          {withMedia.map((x) => (
            <li key={x.id} className="relative aspect-square overflow-hidden rounded-md bg-surface-2">
              <button type="button" className="block h-full w-full" aria-label={`Foto-Beitrag öffnen: ${x.body.slice(0, 40) || "ohne Text"}`} onClick={() => setOpen(x)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(x.media[0].id, "thumb")} alt="" loading="lazy" className="h-full w-full object-cover" />
                {x.media.length > 1 && (
                  <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded bg-scrim px-1.5 text-[11px] text-on-scrim">
                    <Images size={12} aria-hidden />
                    {x.media.length}
                    <span className="sr-only"> Bilder</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ),
    );
  } else if (tab === "beitraege") {
    content = pageBody(posts, (items) =>
      items.length === 0 ? (
        <EmptyState title="Noch keine Beiträge." />
      ) : (
        <ul className="space-y-4">
          {items.map((x) => (
            <li key={x.id}><PostCard post={x} onDeleted={dropPost} onHidden={dropPost} /></li>
          ))}
        </ul>
      ),
    );
  } else if (people.error && !people.data) {
    content = <ErrorState message={people.error} onRetry={people.reload} />;
  } else if (!people.data) {
    content = <ListSkeleton rows={3} />;
  } else if (people.data.length === 0) {
    content = v.canView ? <EmptyState title="Noch niemand." /> : <EmptyState icon={Lock} title="Die Liste ist nur für Follower sichtbar." />;
  } else {
    content = (
      <Card flush className="divide-y divide-border">
        {people.data.map((x) => (
          <Link key={x.userId} href={`/profil/${x.handle}`} className="flex items-center gap-3 p-3 hover:bg-surface-2">
            <Avatar name={x.displayName} mediaId={x.avatarId} />
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{x.displayName}</span><span className="block truncate text-xs text-muted">@{x.handle}</span></span>
          </Link>
        ))}
      </Card>
    );
  }

  return (
    <>
      {!v.isMe && <BackButton fallback="/feed" className="md:hidden">Zurück</BackButton>}
      <Card className="mb-4">
        <DetailHeader
          media={<Avatar name={p.displayName} size={96} mediaId={p.avatarId} />}
          title={p.displayName}
          badges={p.visibility === "private" && <Badge>privat</Badge>}
          subtitle={<>@{p.handle}{p.location && ` · ${p.location}`}</>}
          actions={
            v.isMe ? (
              <LinkButton href="/einstellungen/profil" variant="secondary">Profil bearbeiten</LinkButton>
            ) : (
              <Button variant={v.follow === "none" ? "primary" : "secondary"} aria-busy={followBusy || undefined} onClick={toggleFollow}>
                {v.follow === "following" ? "Du folgst" : v.follow === "requested" ? "Angefragt" : "Folgen"}
              </Button>
            )
          }
        >
          <ul className="mt-3 flex gap-5 text-sm">
            <li><strong>{p.counts.posts}</strong> <span className="text-muted">Beiträge</span></li>
            <li><button type="button" onClick={() => setTab("follower")} className="hover:underline"><strong>{p.counts.followers}</strong> <span className="text-muted">Follower</span></button></li>
            <li><button type="button" onClick={() => setTab("folgt")} className="hover:underline"><strong>{p.counts.following}</strong> <span className="text-muted">Folgt</span></button></li>
          </ul>
        </DetailHeader>
        {p.bio && <p className="mt-4 whitespace-pre-wrap break-words text-sm">{p.bio}</p>}
        {p.clubs && p.clubs.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Vereine">
            {p.clubs.map((c) => (
              <li key={c.slug}>
                <Link href={`/vereine/${c.slug}`} className="inline-flex items-center rounded-full bg-surface-2 px-3 py-1 text-xs text-muted hover:text-text">{c.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <SegmentedControl aria-label="Profilbereiche" mode="tabs" idBase="profil" panelId="profil-panel" options={TABS} value={tab} onChange={setTab} className="mb-4 max-w-full overflow-x-auto" />

      <div {...tabPanelProps("profil", "profil-panel", tab)} className="focus:outline-none">
        {content}
        {pagedTab?.data?.nextCursor && v.canView && <div ref={sentinelRef} aria-hidden />}
        {pagedTab?.data?.nextCursor && v.canView && (
          <div className="mt-4 text-center">
            <Button variant="secondary" busy={moreBusy} onClick={() => { setMoreFailed(false); void loadMore(); }}>Mehr laden</Button>
          </div>
        )}
      </div>

      <Dialog open={!!open} onClose={() => setOpen(null)} title="Beitrag" hideTitle size="lg">
        {open && (
          <PostCard
            post={open}
            onDeleted={(id) => {
              dropPost(id);
              setOpen(null);
            }}
            onHidden={() => setOpen(null)}
          />
        )}
      </Dialog>
    </>
  );
}
