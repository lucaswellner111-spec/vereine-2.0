"use client";

import { Images, Lock } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useRef, useState, type ReactNode } from "react";
import type { FeedPost, PersonItem, ProfileView } from "@vereine/shared";
import { PostCard } from "@/components/post-card";
import { Alert, ArrowLink, Avatar, Badge, Button, Card, CardSkeletons, EmptyState, ErrorState, LinkButton, ListSkeleton } from "@/components/ui";
import { Dialog, SegmentedControl, tabPanelProps } from "@/components/ui-client";
import { toast } from "@/components/ui-hosts";
import { api, describeError } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import { useApi, useBusy } from "@/lib/use-api";

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
  const pathRef = useRef(postsPath);
  pathRef.current = postsPath;
  const [moreBusy, runMore] = useBusy();
  const [tab, setTab] = useState<Tab>("fotos");
  const peopleTab = tab === "follower" || tab === "folgt";
  const people = useApi<PersonItem[]>(peopleTab ? `/profiles/${handle}/${tab === "follower" ? "followers" : "following"}` : null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<FeedPost | null>(null);

  // Neues Profil: wieder mit Fotos beginnen
  useEffect(() => {
    setTab("fotos");
    setOpen(null);
  }, [handle]);

  const loadMore = () =>
    runMore(async () => {
      const cursor = posts.data?.nextCursor;
      if (!cursor) return;
      const requested = postsPath;
      try {
        const r = await api<PostsPage>(`${requested}?cursor=${encodeURIComponent(cursor)}`);
        if (pathRef.current !== requested) return;
        posts.setData((prev) => (prev ? { ...r, posts: [...prev.posts, ...r.posts] } : r));
      } catch (e) {
        toast.error(describeError(e));
      }
    });

  async function toggleFollow() {
    const p = profile.data;
    if (!p) return;
    setError(null);
    try {
      const following = p.viewer.follow !== "none";
      const updated = await api<ProfileView>(`/profiles/${handle}/follow`, following ? { method: "DELETE" } : { method: "POST", body: {} });
      profile.setData(updated);
      if (updated.viewer.canView) posts.reload();
    } catch (e) {
      setError(describeError(e));
    }
  }

  const dropPost = (id: string) => posts.setData((d) => (d ? { ...d, posts: d.posts.filter((x) => x.id !== id) } : d));

  if (profile.errorStatus === 404 || profile.errorStatus === 400) {
    return <EmptyState title="Dieses Profil gibt es nicht." action={<ArrowLink href="/personen">Personen suchen</ArrowLink>} />;
  }
  if (profile.error && !profile.data) return <ErrorState message={profile.error} onRetry={profile.reload} />;
  if (!profile.data) return <CardSkeletons count={1} />;

  const p = profile.data;
  const v = p.viewer;
  const list = posts.data?.posts ?? null;
  const withMedia = (list ?? []).filter((x) => x.media.length > 0);

  const postsBody = (render: (items: FeedPost[]) => ReactNode) =>
    posts.error && !posts.data ? <ErrorState message={posts.error} onRetry={posts.reload} /> : list === null ? <CardSkeletons count={2} /> : render(list);

  let content;
  if (!v.canView && (tab === "fotos" || tab === "beitraege")) {
    content = <EmptyState icon={Lock} title="Dieses Profil ist privat.">Folge {p.displayName}, um die Beiträge zu sehen.</EmptyState>;
  } else if (tab === "fotos") {
    content = postsBody(() =>
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
                  <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 text-[11px] text-white">
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
    content = postsBody((items) =>
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
      <Card className="mb-4">
        <div className="flex flex-wrap items-start gap-4 sm:gap-6">
          <Avatar name={p.displayName} size={96} mediaId={p.avatarId} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{p.displayName}</h1>
              {p.visibility === "private" && <Badge>privat</Badge>}
            </div>
            <p className="text-sm text-muted">@{p.handle}{p.location && ` · ${p.location}`}</p>
            <ul className="mt-3 flex gap-5 text-sm">
              <li><strong>{p.counts.posts}</strong> <span className="text-muted">Beiträge</span></li>
              <li><button type="button" onClick={() => setTab("follower")} className="hover:underline"><strong>{p.counts.followers}</strong> <span className="text-muted">Follower</span></button></li>
              <li><button type="button" onClick={() => setTab("folgt")} className="hover:underline"><strong>{p.counts.following}</strong> <span className="text-muted">Folgt</span></button></li>
            </ul>
          </div>
          <div className="flex gap-2">
            {v.isMe ? (
              <LinkButton href="/einstellungen/profil" variant="secondary">Profil bearbeiten</LinkButton>
            ) : (
              <Button variant={v.follow === "none" ? "primary" : "secondary"} onClick={toggleFollow}>
                {v.follow === "following" ? "Du folgst" : v.follow === "requested" ? "Angefragt" : "Folgen"}
              </Button>
            )}
          </div>
        </div>
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
        {(tab === "fotos" || tab === "beitraege") && posts.data?.nextCursor && v.canView && (
          <div className="mt-4 text-center">
            <Button variant="secondary" busy={moreBusy} onClick={loadMore}>Mehr laden</Button>
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
