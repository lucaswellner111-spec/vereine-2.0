"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FeedPost, FeedResponse, OrgSummary } from "@vereine/shared";
import { PostCard } from "@/components/post-card";
import { Alert, Button, Card, PageHeader } from "@/components/ui";
import { api, describeError } from "@/lib/api";

const hints = {
  ranked: "Sortiert nach Beziehung, Interaktion und Aktualität – den Grund siehst du unter „Warum sehe ich das?“.",
  chrono: "Rein chronologisch, ohne Personalisierung.",
};

export default function FeedPage() {
  const [mode, setMode] = useState<"ranked" | "chrono">("ranked");
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [target, setTarget] = useState(""); // "" = persoenlich, sonst Vereins-Slug
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function publish() {
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api<FeedPost>("/posts", { method: "POST", body: { body: draft, orgSlug: target || undefined } });
      setDraft("");
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

  return (
    <>
      <PageHeader title="Feed" subtitle={hints[effective]} />

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
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="target" className="text-xs text-muted">Posten als</label>
            <select
              id="target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-8 rounded-lg border border-border bg-bg px-2 text-xs"
            >
              <option value="">Ich selbst</option>
              {orgs.map((o) => (
                <option key={o.slug} value={o.slug}>{o.name}</option>
              ))}
            </select>
            <span className="text-xs text-muted">{draft.length}/1000</span>
          </div>
          <Button size="sm" onClick={publish} disabled={!draft.trim() || busy}>Veröffentlichen</Button>
        </div>
      </Card>

      {feed === null ? (
        <p className="text-sm text-muted" role="status">Lade …</p>
      ) : feed.posts.length === 0 ? (
        <Card>
          <p className="text-sm">Hier ist noch nichts. Folge Vereinen oder schreibe den ersten Beitrag.</p>
          <Link href="/vereine" className="mt-3 inline-block text-sm font-medium text-brand hover:underline">Vereine entdecken →</Link>
        </Card>
      ) : (
        <ul className="space-y-4">
          {feed.posts.map((p) => (
            <li key={p.id}>
              <PostCard
                post={p}
                onDeleted={(id) => setFeed((f) => (f ? { ...f, posts: f.posts.filter((x) => x.id !== id) } : f))}
              />
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
