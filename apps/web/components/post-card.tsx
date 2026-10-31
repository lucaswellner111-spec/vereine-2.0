"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { CommentItem, FeedPost } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import { Lightbox } from "./lightbox";
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

export function PostCard({ post: initial, onDeleted, onHidden }: { post: FeedPost; onDeleted: (id: string) => void; onHidden?: (id: string) => void }) {
  const [post, setPost] = useState(initial);
  const [why, setWhy] = useState(false);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState<"none" | "report" | "less">("none");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);

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
      setPanel("none");
      setNotice("Danke, wir prüfen die Meldung.");
    });

  const less = (kind: "hide" | "mute_author" | "mute_org") =>
    run(async () => {
      await api(`/posts/${post.id}/feedback`, { method: "POST", body: { kind } });
      setPanel("none");
      onHidden?.(post.id);
      setNotice(kind === "hide" ? "Beitrag ausgeblendet." : "Gespeichert. Du siehst weniger davon.");
    });

  const remove = () =>
    run(async () => {
      await api(`/posts/${post.id}`, { method: "DELETE" });
      onDeleted(post.id);
    });

  const authorHref = post.author.handle ? `/profil/${post.author.handle}` : null;
  const mediaIds = post.media.map((m) => m.id);

  return (
    <Card>
      <div className="flex items-start gap-3">
        {post.org ? (
          <Avatar name={post.org.name} />
        ) : authorHref ? (
          <Link href={authorHref} aria-label={`Profil von ${post.author.name}`}><Avatar name={post.author.name} mediaId={post.author.avatarId} /></Link>
        ) : (
          <Avatar name={post.author.name} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {post.org ? (
              <Link href={`/vereine/${post.org.slug}`} className="font-medium hover:underline">{post.org.name}</Link>
            ) : authorHref ? (
              <Link href={authorHref} className="font-medium hover:underline">{post.author.name}</Link>
            ) : (
              <span className="font-medium">{post.author.name}</span>
            )}
            {!post.org && post.author.handle && <span className="text-xs text-muted">@{post.author.handle}</span>}
            <span className="text-xs text-muted">{timeAgo(post.createdAt)}</span>
            {post.kind === "event" && <Badge tone="brand">Termin</Badge>}
            {post.kind === "donation" && <Badge tone="accent">Spendenaktion</Badge>}
          </div>

          {post.body && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{post.body}</p>}

          {post.media.length > 0 && (
            <div className={clsx("mt-3 grid gap-1 overflow-hidden rounded-xl", post.media.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
              {post.media.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setLightbox(i)}
                  aria-label={`Bild ${i + 1} von ${post.media.length} vergrößern`}
                  className={clsx("block overflow-hidden bg-surface-2", post.media.length === 1 ? "" : "aspect-square", post.media.length === 3 && i === 0 && "row-span-2 aspect-auto")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(m.id, post.media.length === 1 ? "medium" : "thumb")}
                    alt={`Bild ${i + 1} des Beitrags`}
                    loading="lazy"
                    width={m.width}
                    height={m.height}
                    className={clsx("h-full w-full object-cover", post.media.length === 1 && "max-h-[32rem]")}
                  />
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1 text-sm text-muted">
            <Button variant="ghost" size="sm" aria-pressed={post.likedByMe} onClick={like}>
              {post.likedByMe ? "♥" : "♡"} {post.likes}
            </Button>
            <Button variant="ghost" size="sm" aria-expanded={open} onClick={toggleComments}>💬 {post.comments}</Button>
            <Button variant="ghost" size="sm" onClick={() => setWhy((w) => !w)}>Warum sehe ich das?</Button>
            <span className="ml-auto flex gap-1">
              {post.canDelete && <Button variant="ghost" size="sm" onClick={remove}>Löschen</Button>}
              <Button variant="ghost" size="sm" aria-expanded={panel === "less"} onClick={() => setPanel(panel === "less" ? "none" : "less")}>Weniger davon</Button>
              <Button variant="ghost" size="sm" aria-expanded={panel === "report"} onClick={() => setPanel(panel === "report" ? "none" : "report")}>Melden</Button>
            </span>
          </div>

          {why && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{post.reason}</p>}
          {panel === "report" && (
            <div className="mt-2 flex flex-wrap gap-2 rounded-lg bg-surface-2 p-2" role="group" aria-label="Grund der Meldung">
              {reasons.map((r) => (
                <Button key={r.id} variant="secondary" size="sm" onClick={() => report(r.id)}>{r.label}</Button>
              ))}
            </div>
          )}
          {panel === "less" && (
            <div className="mt-2 flex flex-wrap gap-2 rounded-lg bg-surface-2 p-2" role="group" aria-label="Weniger davon">
              <Button variant="secondary" size="sm" onClick={() => less("hide")}>Diesen Beitrag ausblenden</Button>
              {post.org ? (
                <Button variant="secondary" size="sm" onClick={() => less("mute_org")}>{post.org.name} stummschalten</Button>
              ) : (
                post.canDelete === false && <Button variant="secondary" size="sm" onClick={() => less("mute_author")}>{post.author.name} stummschalten</Button>
              )}
            </div>
          )}
          {notice && <div className="mt-2"><Alert tone="success">{notice}</Alert></div>}
          {error && <div className="mt-2"><Alert>{error}</Alert></div>}

          {open && (
            <div className="mt-3 border-t border-border pt-3">
              <ul className="space-y-2">
                {(comments ?? []).map((c) => (
                  <li key={c.id} className="text-sm">
                    {c.author.handle ? (
                      <Link href={`/profil/${c.author.handle}`} className="font-medium hover:underline">{c.author.name}</Link>
                    ) : (
                      <span className="font-medium">{c.author.name}</span>
                    )}{" "}
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
      {lightbox !== null && <Lightbox ids={mediaIds} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
    </Card>
  );
}
