"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedPost, FeedResponse, MediaRef, OrgSummary } from "@vereine/shared";
import { PostCard } from "@/components/post-card";
import { Alert, Button, Card, PageHeader } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { mediaUrl, uploadImage } from "@/lib/media";

const hints = {
  ranked: "Sortiert nach Beziehung, Interaktion, Vorlieben und Aktualität – den Grund siehst du unter „Warum sehe ich das?“.",
  chrono: "Rein chronologisch, ohne Personalisierung.",
};

export default function FeedPage() {
  const [mode, setMode] = useState<"ranked" | "chrono">("ranked");
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [target, setTarget] = useState(""); // "" = persoenlich, sonst Vereins-Slug
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<MediaRef[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (m: "ranked" | "chrono", cursor?: string) => {
    try {
      const res = await api<FeedResponse>(`/feed?mode=${m}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      setFeed((prev) => (cursor && prev ? { ...res, posts: [...prev.posts, ...res.posts] } : res));
    } catch (e) {
      setError(describeError(e));
    }
  }, []);

  useEffect(() => {
    void load(mode);
  }, [mode, load]);

  useEffect(() => {
    api<OrgSummary[]>("/orgs/mine").then(setOrgs).catch(() => setOrgs([]));
  }, []);

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

  async function publish() {
    if (!draft.trim() && images.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api<FeedPost>("/posts", {
        method: "POST",
        body: { body: draft, orgSlug: target || undefined, mediaIds: images.map((i) => i.id) },
      });
      setDraft("");
      setImages([]);
      await load(mode);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const effective = feed?.mode ?? "chrono";
  const rankedLocked = feed !== null && !feed.personalized && mode === "ranked";
  // Ohne Einwilligung ist faktisch "Neueste" aktiv; der Tab soll das zeigen.
  const activeTab = rankedLocked ? "chrono" : mode;
  const dropPost = (id: string) => setFeed((f) => (f ? { ...f, posts: f.posts.filter((x) => x.id !== id) } : f));

  return (
    <>
      <PageHeader
        title="Feed"
        subtitle={hints[effective]}
        action={<Link href="/personen" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2">Personen finden</Link>}
      />

      <div role="tablist" aria-label="Feed-Sortierung" className="mb-4 inline-flex rounded-lg border border-border bg-surface p-1">
        {([["ranked", "Für dich"], ["chrono", "Neueste"]] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setMode(id)}
            className={clsx("rounded-md px-3 py-1.5 text-sm font-medium", activeTab === id ? "bg-brand text-brand-contrast" : "text-muted hover:text-text")}
          >
            {label}
          </button>
        ))}
      </div>

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
        <textarea
          id="composer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Was gibt es Neues?"
          className="w-full resize-none rounded-lg border border-border bg-bg p-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
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
                  className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-danger text-xs leading-5 text-white"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} id="file" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => pickImages(e.target.files)} />
            <label
              htmlFor="file"
              className={clsx(
                "inline-flex h-8 cursor-pointer items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:bg-surface-2",
                (uploading || images.length >= 4) && "pointer-events-none opacity-50",
              )}
            >
              {uploading ? "Lädt hoch …" : `📷 Bild${images.length ? ` (${images.length}/4)` : ""}`}
            </label>
            <label htmlFor="target" className="text-xs text-muted">Posten als</label>
            <select id="target" value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 rounded-lg border border-border bg-bg px-2 text-xs">
              <option value="">Ich selbst</option>
              {orgs.map((o) => (
                <option key={o.slug} value={o.slug}>{o.name}</option>
              ))}
            </select>
            <span className="text-xs text-muted">{draft.length}/1000</span>
          </div>
          <Button size="sm" onClick={publish} disabled={(!draft.trim() && images.length === 0) || busy || uploading}>Veröffentlichen</Button>
        </div>
      </Card>

      {feed === null ? (
        <p className="text-sm text-muted" role="status">Lade …</p>
      ) : feed.posts.length === 0 ? (
        <Card>
          <p className="text-sm">Hier ist noch nichts. Folge Vereinen oder Personen oder schreibe den ersten Beitrag.</p>
          <div className="mt-3 flex gap-4 text-sm font-medium text-brand">
            <Link href="/vereine" className="hover:underline">Vereine entdecken →</Link>
            <Link href="/personen" className="hover:underline">Personen finden →</Link>
          </div>
        </Card>
      ) : (
        <ul className="space-y-4">
          {feed.posts.map((p) => (
            <li key={p.id}>
              <PostCard post={p} onDeleted={dropPost} onHidden={dropPost} />
            </li>
          ))}
        </ul>
      )}
      {feed?.nextCursor && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => load(mode, feed.nextCursor!)}>Mehr laden</Button>
        </div>
      )}
    </>
  );
}
