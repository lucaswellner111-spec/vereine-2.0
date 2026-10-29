"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ConsentState } from "@vereine/shared";
import { api } from "@/lib/api";
import { Alert, Avatar, Badge, Button, Card, ConceptNote, PageHeader } from "@/components/ui";
import { posts as initialPosts, type Post } from "@/lib/mock";

const modes = [
  { id: "ranked", label: "Für dich", hint: "Transparent sortiert nach Aktualität, Beziehung und Interaktion." },
  { id: "chrono", label: "Neueste", hint: "Rein chronologisch, ohne Personalisierung." },
] as const;

export default function FeedPage() {
  const [mode, setMode] = useState<(typeof modes)[number]["id"]>("ranked");
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [draft, setDraft] = useState("");
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [why, setWhy] = useState<string | null>(null);
  const [personalized, setPersonalized] = useState<boolean | null>(null);

  // Personalisierung nur mit Einwilligung (Einstellungen > Datenschutz); sonst chronologisch.
  useEffect(() => {
    api<ConsentState[]>("/privacy/consents")
      .then((c) => {
        const on = c.find((x) => x.purpose === "personalized_feed")?.granted ?? false;
        setPersonalized(on);
        setMode(on ? "ranked" : "chrono");
      })
      .catch(() => setPersonalized(false));
  }, []);

  // Konzept-Ranking: Interaktion, abgeschwaecht durch das Alter. Echtes Ranking folgt serverseitig.
  const score = (p: Post) => (p.likes + p.comments * 3) / (1 + p.ageHours / 12);
  const list = [...posts].sort((a, b) => (mode === "chrono" ? a.ageHours - b.ageHours : score(b) - score(a)));

  function publish() {
    if (!draft.trim()) return;
    setPosts((p) => [
      { id: crypto.randomUUID(), author: "Du", orgSlug: "", time: "gerade eben", ageHours: 0, text: draft.trim(), likes: 0, comments: 0, reason: "Dein eigener Beitrag.", kind: "update" },
      ...p,
    ]);
    setDraft("");
  }

  return (
    <>
      <PageHeader title="Feed" subtitle={modes.find((m) => m.id === mode)?.hint} />
      {personalized === false && (
        <div className="mb-4">
          <Alert tone="info">
            Du siehst den chronologischen Feed. Für „Für dich“ aktiviere den personalisierten Feed unter{" "}
            <Link href="/einstellungen/datenschutz" className="text-brand underline">Datenschutz</Link>.
          </Alert>
        </div>
      )}
      <ConceptNote>Beiträge sind Beispieldaten. Speichern, Ranking und Moderation folgen im Modul „Feed“.</ConceptNote>

      <div role="tablist" aria-label="Feed-Sortierung" className="mb-4 inline-flex rounded-lg border border-border bg-surface p-1">
        {modes.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            disabled={m.id === "ranked" && personalized === false}
            className={clsx("rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40", mode === m.id ? "bg-brand text-brand-contrast" : "text-muted hover:text-text")}
          >
            {m.label}
          </button>
        ))}
      </div>

      <Card className="mb-4">
        <label htmlFor="composer" className="sr-only">Neuer Beitrag</label>
        <textarea
          id="composer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Was gibt es Neues im Verein?"
          className="w-full resize-none rounded-lg border border-border bg-bg p-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted">{draft.length}/1000</span>
          <Button size="sm" onClick={publish} disabled={!draft.trim()}>Veröffentlichen</Button>
        </div>
      </Card>

      <ul className="space-y-4">
        {list.map((post) => (
          <li key={post.id}>
            <Card>
              <div className="flex items-start gap-3">
                <Avatar name={post.author} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {post.orgSlug ? (
                      <Link href={`/vereine/${post.orgSlug}`} className="font-medium hover:underline">{post.author}</Link>
                    ) : (
                      <span className="font-medium">{post.author}</span>
                    )}
                    <span className="text-xs text-muted">{post.time}</span>
                    {post.kind === "event" && <Badge tone="brand">Termin</Badge>}
                    {post.kind === "donation" && <Badge tone="accent">Spendenaktion</Badge>}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{post.text}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1 text-sm text-muted">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-pressed={liked.has(post.id)}
                      onClick={() =>
                        setLiked((s) => {
                          const n = new Set(s);
                          n.has(post.id) ? n.delete(post.id) : n.add(post.id);
                          return n;
                        })
                      }
                    >
                      {liked.has(post.id) ? "♥" : "♡"} {post.likes + (liked.has(post.id) ? 1 : 0)}
                    </Button>
                    <Button variant="ghost" size="sm">💬 {post.comments}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setWhy(why === post.id ? null : post.id)}>
                      Warum sehe ich das?
                    </Button>
                    <Button variant="ghost" size="sm" className="ml-auto">Melden</Button>
                  </div>
                  {why === post.id && (
                    <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{post.reason}</p>
                  )}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
