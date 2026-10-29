"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { CommentItem, FeedPost } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { Alert, Avatar, Badge, Button, Card } from "./ui";

const timeAgo = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  return `vor ${Math.round(hours / 24)} Tg.`;
};

const reasons = [
  { id: "spam", label: "Spam" },
  { id: "hate", label: "Hass / Hetze" },
  { id: "illegal", label: "Illegal" },
  { id: "other", label: "Sonstiges" },
] as const;

export function PostCard({ post: initial, onDeleted }: { post: FeedPost; onDeleted: (id: string) => void }) {
  const [post, setPost] = useState(initial);
  const [why, setWhy] = useState(false);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [draft, setDraft] = useState("");
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(describeError(e));
    }
  };

  const like = () =>
    run(async () => {
      const r = await api<{ liked: boolean; likes: number }>(`/posts/${post.id}/like`, { method: "POST", body: {} });
      setPost((p) => ({ ...p, likedByMe: r.liked, likes: r.likes }));
    });

  const toggleComments = () =>
    run(async () => {
      if (!open && comments === null) setComments(await api<CommentItem[]>(`/posts/${post.id}/comments`));
      setOpen((o) => !o);
    });

  const addComment = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    void run(async () => {
      const c = await api<CommentItem>(`/posts/${post.id}/comments`, { method: "POST", body: { body: draft } });
      setComments((list) => [...(list ?? []), c]);
      setPost((p) => ({ ...p, comments: p.comments + 1 }));
      setDraft("");
    });
  };

  const report = (reason: (typeof reasons)[number]["id"]) =>
    run(async () => {
      await api(`/posts/${post.id}/report`, { method: "POST", body: { reason } });
      setReporting(false);
      setNotice("Danke, wir prüfen die Meldung.");
    });

  const remove = () =>
    run(async () => {
      await api(`/posts/${post.id}`, { method: "DELETE" });
      onDeleted(post.id);
    });

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Avatar name={post.org?.name ?? post.author.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {post.org ? (
              <Link href={`/vereine/${post.org.slug}`} className="font-medium hover:underline">{post.org.name}</Link>
            ) : (
              <span className="font-medium">{post.author.name}</span>
            )}
            <span className="text-xs text-muted">{timeAgo(post.createdAt)}</span>
            {post.kind === "event" && <Badge tone="brand">Termin</Badge>}
            {post.kind === "donation" && <Badge tone="accent">Spendenaktion</Badge>}
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{post.body}</p>

          <div className="mt-3 flex flex-wrap items-center gap-1 text-sm text-muted">
            <Button variant="ghost" size="sm" aria-pressed={post.likedByMe} onClick={like}>
              {post.likedByMe ? "♥" : "♡"} {post.likes}
            </Button>
            <Button variant="ghost" size="sm" aria-expanded={open} onClick={toggleComments}>💬 {post.comments}</Button>
            <Button variant="ghost" size="sm" onClick={() => setWhy((w) => !w)}>Warum sehe ich das?</Button>
            <span className="ml-auto flex gap-1">
              {post.canDelete && <Button variant="ghost" size="sm" onClick={remove}>Löschen</Button>}
              <Button variant="ghost" size="sm" onClick={() => setReporting((r) => !r)}>Melden</Button>
            </span>
          </div>

          {why && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{post.reason}</p>}
          {reporting && (
            <div className="mt-2 flex flex-wrap gap-2 rounded-lg bg-surface-2 p-2" role="group" aria-label="Grund der Meldung">
              {reasons.map((r) => (
                <Button key={r.id} variant="secondary" size="sm" onClick={() => report(r.id)}>{r.label}</Button>
              ))}
            </div>
          )}
          {notice && <div className="mt-2"><Alert tone="success">{notice}</Alert></div>}
          {error && <div className="mt-2"><Alert>{error}</Alert></div>}

          {open && (
            <div className="mt-3 border-t border-border pt-3">
              <ul className="space-y-2">
                {(comments ?? []).map((c) => (
                  <li key={c.id} className="text-sm">
                    <span className="font-medium">{c.author.name}</span>{" "}
                    <span className="text-xs text-muted">{timeAgo(c.createdAt)}</span>
                    <p className="break-words text-muted">{c.body}</p>
                  </li>
                ))}
                {comments?.length === 0 && <li className="text-xs text-muted">Noch keine Kommentare.</li>}
              </ul>
              <form onSubmit={addComment} className="mt-3 flex gap-2">
                <label htmlFor={`c-${post.id}`} className="sr-only">Kommentar</label>
                <input
                  id={`c-${post.id}`}
                  value={draft}
                  maxLength={500}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Kommentar schreiben …"
                  className="h-9 flex-1 rounded-lg border border-border bg-bg px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
                <Button type="submit" size="sm" disabled={!draft.trim()}>Senden</Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
