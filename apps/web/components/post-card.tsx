"use client";

import clsx from "clsx";
import { Heart, MessageCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import type { CommentItem, FeedPost } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { Lightbox } from "./lightbox";
import { TagChips } from "./tag-chips";
import { ask, toast } from "./ui-hosts";
import { Alert, Avatar, Badge, Button, Card, Input } from "./ui";
import { REPORT_REASONS, type ReportReason } from "@/lib/labels";

const timeAgo = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  return `vor ${Math.round(hours / 24)} Tg.`;
};

export function PostCard({ post: initial, onDeleted, onHidden }: { post: FeedPost; onDeleted: (id: string) => void; onHidden?: (id: string) => void }) {
  const { user } = useAuth();
  const [post, setPost] = useState(initial);
  // Neue Daten vom Elternteil (z. B. nach reload) uebernehmen, ohne Effekt-Schleife
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setPost(initial);
  }
  const [why, setWhy] = useState(false);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState<"none" | "report" | "less">("none");
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const liking = useRef(false);
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(describeError(e));
    }
  };

  // Optimistisch: Herz und Zahl aendern sich sofort, bei Fehler wird zurueckgesetzt.
  const like = () =>
    run(async () => {
      // Sperre gegen schnelle Doppelklicks (sonst zwei Anfragen, Zaehler springt)
      if (liking.current) return;
      liking.current = true;
      const before = post;
      setPost((p) => ({ ...p, likedByMe: !p.likedByMe, likes: p.likes + (p.likedByMe ? -1 : 1) }));
      try {
        const r = await api<{ liked: boolean; likes: number }>(`/posts/${post.id}/like`, { method: "POST", body: {} });
        setPost((p) => ({ ...p, likedByMe: r.liked, likes: r.likes }));
      } catch (e) {
        setPost(before);
        throw e;
      } finally {
        liking.current = false;
      }
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

  // Loeschen: eigene Kommentare und alle Kommentare unter dem eigenen persoenlichen Beitrag
  const canDeleteComment = (c: CommentItem) => !!user && (c.author.id === user.id || (post.author.id === user.id && !post.org));
  const deleteComment = async (c: CommentItem) => {
    if (!(await ask("Kommentar löschen? Das lässt sich nicht rückgängig machen.", { confirmLabel: "Löschen", danger: true }))) return;
    try {
      await api(`/comments/${c.id}`, { method: "DELETE" });
      setComments((list) => (list ?? []).filter((x) => x.id !== c.id));
      setPost((p) => ({ ...p, comments: Math.max(0, p.comments - 1) }));
      toast.success("Kommentar gelöscht.");
    } catch (e) {
      toast.error(describeError(e));
    }
  };

  const report = (reason: ReportReason) =>
    run(async () => {
      await api(`/posts/${post.id}/report`, { method: "POST", body: { reason } });
      setPanel("none");
      toast.success("Danke, wir prüfen die Meldung.");
    });

  const less = (kind: "hide" | "mute_author" | "mute_org") =>
    run(async () => {
      await api(`/posts/${post.id}/feedback`, { method: "POST", body: { kind } });
      setPanel("none");
      toast.success(kind === "hide" ? "Beitrag ausgeblendet." : "Gespeichert. Du siehst weniger davon.");
      onHidden?.(post.id);
    });

  const remove = async () => {
    if (!(await ask("Beitrag löschen? Das lässt sich nicht rückgängig machen.", { confirmLabel: "Löschen" }))) return;
    await run(async () => {
      await api(`/posts/${post.id}`, { method: "DELETE" });
      onDeleted(post.id);
    });
  };

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

          <TagChips tags={post.tags} to="/feed" className="mt-3" />

          <div className="mt-3 flex flex-wrap items-center gap-1 text-sm text-muted">
            <Button variant="ghost" size="sm" aria-pressed={post.likedByMe} aria-label={`Gefällt mir, ${post.likes}`} onClick={like}>
              <Heart size={15} aria-hidden className={clsx(post.likedByMe && "fill-current text-danger")} /> {post.likes}
            </Button>
            <Button variant="ghost" size="sm" aria-expanded={open} aria-label={`Kommentare, ${post.comments}`} onClick={toggleComments}>
              <MessageCircle size={15} aria-hidden /> {post.comments}
            </Button>
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
              {REPORT_REASONS.map((r) => (
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
                    {canDeleteComment(c) && (
                      <button
                        type="button"
                        onClick={() => void deleteComment(c)}
                        aria-label="Kommentar löschen"
                        title="Kommentar löschen"
                        className="ml-1 inline-flex align-middle text-muted hover:text-danger"
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    )}
                    <p className="break-words text-muted">{c.body}</p>
                  </li>
                ))}
                {comments?.length === 0 && <li className="text-xs text-muted">Noch keine Kommentare.</li>}
              </ul>
              <form onSubmit={addComment} className="mt-3 flex gap-2">
                <label htmlFor={`c-${post.id}`} className="sr-only">Kommentar</label>
                <Input
                  id={`c-${post.id}`}
                  size="sm"
                  value={draft}
                  maxLength={500}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Kommentar schreiben …"
                  className="min-w-0 flex-1"
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
