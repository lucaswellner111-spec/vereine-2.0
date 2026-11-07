"use client";

import clsx from "clsx";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Camera, X } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import type { FeedPost, FeedResponse, MediaRef, OrgSummary } from "@vereine/shared";
import { PostCard } from "@/components/post-card";
import { MAX_POST_TAGS, tagLabel } from "@vereine/shared";
import { TagPicker } from "@/components/tag-picker";
import { Alert, ArrowLink, Button, Card, CardSkeletons, EmptyState, ErrorState, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import { SegmentedControl, tabPanelProps } from "@/components/ui-client";
import { toast } from "@/components/ui-hosts";
import { api, describeError } from "@/lib/api";
import { mediaUrl, uploadImage } from "@/lib/media";
import { useApi, useBusy } from "@/lib/use-api";

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
  const feed = useApi<FeedResponse>(path);
  const pathRef = useRef(path);
  pathRef.current = path;
  const [moreBusy, runMore] = useBusy();

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
        feed.setData((prev) => (prev ? { ...res, posts: [...prev.posts, ...res.posts] } : res));
      } catch (e) {
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
        await api<FeedPost>("/posts", {
          method: "POST",
          body: { body: draft, orgSlug: target || undefined, mediaIds: images.map((i) => i.id), tags },
        });
        setDraft("");
        setImages([]);
        setTags([]);
        feed.reload();
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
          <li key={p.id}>
            <PostCard post={p} onDeleted={dropPost} onHidden={dropPost} showReason={effective === "ranked"} />
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <PageHeader
        title="Feed"
        subtitle={hints[effective]}
        action={<LinkButton href="/personen" variant="secondary">Personen finden</LinkButton>}
      />

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

      <Card className="mb-4">
        <label htmlFor="composer" className="sr-only">Neuer Beitrag</label>
        <Textarea
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
          <input ref={fileRef} id="file" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => pickImages(e.target.files)} />
          <label
            htmlFor="file"
            className={clsx(
              "inline-flex h-9 cursor-pointer items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:bg-surface-2 pointer-coarse:h-10",
              (uploading || images.length >= 4) && "pointer-events-none opacity-50",
            )}
          >
            <Camera size={14} aria-hidden className="mr-1.5" />
            {uploading ? "Lädt hoch …" : `Bild${images.length ? ` (${images.length}/4)` : ""}`}
          </label>
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

      <div {...tabPanelProps("feed", "feed-panel", activeTab)} className="focus:outline-none">
        {list}
        {data?.nextCursor && (
          <div className="mt-4 text-center">
            <Button variant="secondary" busy={moreBusy} onClick={loadMore}>Mehr laden</Button>
          </div>
        )}
      </div>
    </>
  );
}
