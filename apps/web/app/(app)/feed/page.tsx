"use client";

import clsx from "clsx";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Camera, Info, UserSearch, X } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { FeedPost, FeedResponse, MediaRef, OrgSummary } from "@vereine/shared";
import { PostCard } from "@/components/post-card";
import { MAX_POST_TAGS, tagLabel } from "@vereine/shared";
import { LazyTagPicker as TagPicker } from "@/components/lazy";
import { Alert, ArrowLink, Avatar, Button, Card, FileButton, CardSkeletons, EmptyState, ErrorState, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import { Dialog, SegmentedControl, tabPanelProps } from "@/components/ui-client";
import { toast } from "@/components/ui-hosts";
import { api, describeError } from "@/lib/api";
import { mediaUrl, uploadImage } from "@/lib/media";
import { useAuth } from "@/lib/auth";
import { mergeFeed } from "@/lib/feed";
import { useMyProfile } from "@/lib/my-profile";
import { useApi, useBusy } from "@/lib/use-api";
import { useInfiniteScroll, useMoreFailed } from "@/lib/use-infinite-scroll";
import { NEW_POST_EVENT } from "@/lib/shortcuts";

const hints = {
  ranked: "Sortiert nach Beziehung, Interaktion, Vorlieben und Aktualität – den Grund siehst du unter „Warum sehe ich das?“.",
  chrono: "Rein chronologisch, ohne Personalisierung.",
};
type Mode = "ranked" | "chrono";
const MODES: { value: Mode; label: string }[] = [
  { value: "ranked", label: "Für dich" },
  { value: "chrono", label: "Neueste" },
];

export default function FeedPage() {
  // useSearchParams braucht eine Suspense-Grenze, sonst bricht next build ab
  return (
    <Suspense fallback={<CardSkeletons count={2} />}>
      <Feed />
    </Suspense>
  );
}

function Feed() {
  const filterTag = useSearchParams().get("tag") ?? "";
  const [mode, setMode] = useState<Mode>("ranked");
  const path = `/feed?mode=${mode}${filterTag ? `&tag=${encodeURIComponent(filterTag)}` : ""}`;
  const feed = useApi<FeedResponse>(path, { refreshOnFocus: true, merge: mergeFeed });
  const { user } = useAuth();
  const myAvatar = useMyProfile().profile?.avatarId ?? null;
  // Handy: Beitragsfeld startet eingeklappt (per CSS, damit am Desktop nichts aufblitzt)
  const [composerOpen, setComposerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const pathRef = useRef(path);
  pathRef.current = path;
  const [moreBusy, runMore] = useBusy();
  const [moreFailed, setMoreFailed] = useMoreFailed(path);

  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [target, setTarget] = useState(""); // "" = persoenlich, sonst Vereins-Slug
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<MediaRef[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const [tags, setTags] = useState<string[]>([]); // Tags des neuen Beitrags
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<OrgSummary[]>("/orgs/mine").then(setOrgs).catch(() => setOrgs([]));
  }, []);

  const loadMore = () =>
    runMore(async () => {
      const cursor = feed.data?.nextCursor;
      if (!cursor) return;
      const requested = path;
      try {
        const res = await api<FeedResponse>(`${requested}&cursor=${encodeURIComponent(cursor)}`);
        if (pathRef.current !== requested) return; // Ansicht wurde inzwischen gewechselt
        // Doppelte vermeiden (Ranking-Cursor ist ein Versatz, stille Aktualisierung kann Beitraege oben einfuegen)
        feed.setData((prev) => {
          if (!prev) return res;
          const known = new Set(prev.posts.map((p) => p.id));
          return { ...res, posts: [...prev.posts, ...res.posts.filter((p) => !known.has(p.id))] };
        });
      } catch (e) {
        setMoreFailed(true); // Sentinel sperren, sonst Endlosschleife
        toast.error(describeError(e));
      }
    });

  async function pickImages(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 4 - images.length)) {
        const ref = await uploadImage("post", file);
        setImages((prev) => [...prev, ref]);
      }
    } catch (e) {
      setError(describeError(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const publish = () =>
    run(async () => {
      if (!draft.trim() && images.length === 0) return;
      setError(null);
      try {
        const post = await api<FeedPost>("/posts", {
          method: "POST",
          body: { body: draft, orgSlug: target || undefined, mediaIds: images.map((i) => i.id), tags },
        });
        setDraft("");
        setImages([]);
        setTags([]);
        setComposerOpen(false);
        // Neuen Beitrag oben einfuegen statt den ganzen Feed neu zu laden
        feed.setData((f) => (f ? { ...f, posts: [post, ...f.posts.filter((x) => x.id !== post.id)] } : f));
        toast.success("Beitrag veröffentlicht.");
      } catch (e) {
        setError(describeError(e));
      }
    });

  const data = feed.data;
  const effective = data?.mode ?? "chrono";
  const rankedLocked = data !== null && !data.personalized && mode === "ranked";
  // Ohne Einwilligung ist faktisch "Neueste" aktiv; der Tab soll das zeigen.
  const activeTab = rankedLocked ? "chrono" : mode;
  const dropPost = (id: string) => feed.setData((f) => (f ? { ...f, posts: f.posts.filter((x) => x.id !== id) } : f));
  /** "Weniger davon -> ausblenden": Fokus auf den naechsten Beitrag (sonst vorherigen bzw. die Liste), nicht ins Leere. */
  const hidePost = (id: string) => {
    const items = data?.posts ?? [];
    const i = items.findIndex((x) => x.id === id);
    const nextId = items[i + 1]?.id ?? items[i - 1]?.id ?? null;
    dropPost(id);
    requestAnimationFrame(() => {
      const target = nextId ? document.querySelector<HTMLElement>(`[data-post-id="${CSS.escape(nextId)}"]`) : null;
      (target ?? document.getElementById("feed-panel"))?.focus();
    });
  };
  const sentinelRef = useInfiniteScroll({ hasMore: !!data?.nextCursor && !moreFailed, loading: moreBusy, onLoadMore: () => void loadMore() });
  const expanded = composerOpen || !!draft || images.length > 0;
  const openComposer = () => {
    // synchron aufklappen, damit der Fokus noch im Tipp-Ereignis liegt (iOS oeffnet sonst keine Tastatur)
    flushSync(() => setComposerOpen(true));
    composerRef.current?.focus();
  };
  const openRef = useRef(openComposer);
  openRef.current = openComposer;
  // Tastenkuerzel "n": Beitragsfeld oeffnen und fokussieren
  useEffect(() => {
    const onNew = () => {
      openRef.current();
      composerRef.current?.scrollIntoView({ block: "center" });
    };
    window.addEventListener(NEW_POST_EVENT, onNew);
    return () => window.removeEventListener(NEW_POST_EVENT, onNew);
  }, []);

  let list;
  if (feed.error && !data) list = <ErrorState message={feed.error} onRetry={feed.reload} />;
  else if (!data) list = <CardSkeletons count={2} />;
  else if (!data.posts.length)
    list = (
      <EmptyState
        title="Hier ist noch nichts."
        action={
          <div className="flex flex-wrap justify-center gap-4">
            <ArrowLink href="/vereine">Vereine entdecken</ArrowLink>
            <ArrowLink href="/personen">Personen finden</ArrowLink>
          </div>
        }
      >
        Folge Vereinen oder Personen oder schreibe den ersten Beitrag.
      </EmptyState>
    );
  else
    list = (
      <ul className="space-y-4">
        {data.posts.map((p) => (
          <li key={p.id} data-post-id={p.id} tabIndex={-1} className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
            <PostCard post={p} onDeleted={dropPost} onHidden={hidePost} showReason={effective === "ranked"} />
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <PageHeader
        title="Feed"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Wie ist der Feed sortiert?"
              aria-haspopup="dialog"
              onClick={() => setInfoOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
            >
              <Info size={18} aria-hidden />
            </button>
            <LinkButton href="/personen" variant="secondary" aria-label="Personen finden" className="max-sm:w-10 max-sm:px-0">
              <UserSearch size={16} aria-hidden />
              <span className="max-sm:hidden">Personen finden</span>
            </LinkButton>
          </div>
        }
      />
      <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} title={effective === "ranked" ? "So sortiert „Für dich“" : "So sortiert „Neueste“"} placement="sheet" size="sm">
        <p className="text-sm text-muted">{hints[effective]}</p>
      </Dialog>

      {filterTag && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-muted">Gefiltert nach</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2.5 py-1 text-xs font-medium text-brand">
            {tagLabel(filterTag)}
            <Link href="/feed" aria-label="Filter entfernen" className="relative inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand/20 hit-area"><X size={12} aria-hidden /></Link>
          </span>
          <Link href={`/vereine?tag=${encodeURIComponent(filterTag)}`} className="text-brand hover:underline">Vereine dazu</Link>
        </div>
      )}

      <SegmentedControl
        aria-label="Feed-Sortierung"
        mode="tabs"
        idBase="feed"
        panelId="feed-panel"
        options={MODES}
        value={activeTab}
        onChange={setMode}
        className="mb-4"
      />

      {rankedLocked && (
        <div className="mb-4">
          <Alert tone="info">
            Du siehst den chronologischen Feed. Für „Für dich“ aktiviere den personalisierten Feed unter{" "}
            <Link href="/einstellungen/datenschutz" className="text-brand underline">Datenschutz</Link>.
          </Alert>
        </div>
      )}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {!expanded && (
        <button
          type="button"
          onClick={openComposer}
          aria-controls="composer-card"
          aria-expanded={false}
          className="mb-4 flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left text-sm text-muted shadow-card hover:bg-surface-2 md:hidden"
        >
          {user && <Avatar name={user.displayName} mediaId={myAvatar} size={32} />}
          <span className="flex-1">Was gibt es Neues?</span>
          <Camera size={18} aria-hidden />
        </button>
      )}

      <div id="composer-card" className={clsx(!expanded && "max-md:hidden")}>
      <Card className="mb-4">
        <label htmlFor="composer" className="sr-only">Neuer Beitrag</label>
        <Textarea
          ref={composerRef}
          id="composer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Was gibt es Neues?"
          className="w-full"
        />
        {images.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Angehängte Bilder">
            {images.map((img) => (
              <li key={img.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(img.id, "thumb")} alt="Vorschau" className="h-20 w-20 rounded-lg object-cover" />
                <button
                  type="button"
                  aria-label="Bild entfernen"
                  onClick={() => setImages((l) => l.filter((x) => x.id !== img.id))}
                  className="hit-area absolute -right-1.5 -top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-danger text-on-danger"
                >
                  <X size={12} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* Zeile 2: Bild, Absender, Zaehler und Veroeffentlichen */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <FileButton
            ref={fileRef}
            size="sm"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={uploading || images.length >= 4}
            aria-label={`Bild anhängen${images.length ? `, ${images.length} von 4` : ""}`}
            onChange={(e) => pickImages(e.target.files)}
          >
            <Camera size={14} aria-hidden />
            {uploading ? "Lädt hoch …" : `Bild${images.length ? ` (${images.length}/4)` : ""}`}
          </FileButton>
          <label htmlFor="target" className="text-xs text-muted">Posten als</label>
          <Select id="target" size="sm" value={target} onChange={(e) => setTarget(e.target.value)} className="min-w-0 max-sm:flex-1 sm:max-w-56">
            <option value="">Ich selbst</option>
            {orgs.map((o) => (
              <option key={o.slug} value={o.slug}>{o.name}</option>
            ))}
          </Select>
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted">{draft.length}/1000</span>
            <Button size="sm" onClick={publish} busy={busy} disabled={(!draft.trim() && images.length === 0) || uploading}>Veröffentlichen</Button>
          </span>
        </div>
        {/* Zeile 3: Tags ueber die volle Breite */}
        <div className="mt-3 border-t border-border pt-3">
          <TagPicker label="Tags (optional)" value={tags} onChange={setTags} max={MAX_POST_TAGS} hint={target ? "Ohne Auswahl übernimmt der Beitrag die Tags des Vereins." : undefined} />
        </div>
      </Card>
      </div>

      <div {...tabPanelProps("feed", "feed-panel", activeTab)} className="focus:outline-none">
        {list}
        {data?.nextCursor && <div ref={sentinelRef} aria-hidden />}
        {data?.nextCursor && (
          <div className="mt-4 text-center">
            <Button variant="secondary" busy={moreBusy} onClick={() => { setMoreFailed(false); void loadMore(); }}>Mehr laden</Button>
          </div>
        )}
      </div>
    </>
  );
}
