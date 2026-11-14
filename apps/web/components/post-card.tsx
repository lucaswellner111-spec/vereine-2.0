"use client";

import { haptic } from "@/lib/haptics";
import clsx from "clsx";
import { EyeOff, Flag, Heart, Image as ImageIcon, Info, MessageCircle, Pencil, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MAX_POST_TAGS, type CommentItem, type FeedPost } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { shareLink } from "@/lib/share";
import { useBusy } from "@/lib/use-api";
import { useDoubleTap } from "@/lib/use-double-tap";
import { LazyLightbox, LazyTagPicker as TagPicker } from "./lazy";
import { LikersSheet } from "./likers-sheet";
import { PollView } from "./poll-view";
import { RichText } from "./rich-text";
import { TagChips } from "./tag-chips";
import { ask, toast } from "./ui-hosts";
import { Alert, Avatar, Badge, Button, Card, Input, TextareaField, UserAvatarLink, UserNameLink } from "./ui";
import { Dialog, DropdownMenu, type MenuEntry } from "./ui-client";
import { REPORT_REASONS, type ReportReason } from "@/lib/labels";

const timeAgo = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  return `vor ${Math.round(hours / 24)} Tg.`;
};

export const postHref = (id: string) => `/beitrag/${id}`;

/** Menue eines Beitrags (exportiert fuer Tests): "Bearbeiten" nur mit canEdit, "Löschen" nur mit canDelete. */
export function postMenuIds(post: Pick<FeedPost, "canEdit" | "canDelete"> & { org?: FeedPost["org"] }, showReason: boolean): string[] {
  return [
    ...(showReason ? ["why"] : []),
    ...(post.canEdit ? ["edit"] : []),
    "share",
    // Story-Kachel nur fuer Vereinsbeitraege (auf der Kachel steht nur der Vereinsname, keine Personen)
    ...(post.org ? ["story"] : []),
    "less",
    "report",
    ...(post.canDelete ? ["delete"] : []),
  ];
}

type ReportTarget = { kind: "post" } | { kind: "comment"; id: string };

export function PostCard({
  post: initial,
  onDeleted,
  onHidden,
  showReason = false,
  initialCommentsOpen = false,
}: {
  post: FeedPost;
  onDeleted: (id: string) => void;
  onHidden?: (id: string) => void;
  /** "Warum sehe ich das?" anbieten – nur im personalisierten Feed ("Für dich") sinnvoll. */
  showReason?: boolean;
  /** Detailseite: Kommentare gleich laden und zeigen. */
  initialCommentsOpen?: boolean;
}) {
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
  const [panel, setPanel] = useState<"none" | "report" | "less" | "edit">("none");
  const [reportTarget, setReportTarget] = useState<ReportTarget>({ kind: "post" });
  const [edit, setEdit] = useState({ body: "", tags: [] as string[] });
  const [editBusy, runEdit] = useBusy();
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [likers, setLikers] = useState(false);
  const [burst, setBurst] = useState(0); // Doppeltipp aufs Bild: grosses Herz blendet kurz ein
  const [replyTo, setReplyTo] = useState<{ parentId: string; name: string } | null>(null);
  const draftRef = useRef<HTMLInputElement>(null);

  const liking = useRef(false);
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(describeError(e));
    }
  };

  // Detailseite: Kommentare direkt laden
  useEffect(() => {
    if (!initialCommentsOpen) return;
    let alive = true;
    api<CommentItem[]>(`/posts/${initial.id}/comments`)
      .then((list) => {
        if (!alive) return;
        setComments(list);
        setOpen(true);
      })
      .catch((e) => alive && setError(describeError(e)));
    return () => {
      alive = false;
    };
  }, [initialCommentsOpen, initial.id]);

  // Optimistisch: Herz und Zahl aendern sich sofort, bei Fehler wird zurueckgesetzt.
  const like = () =>
    run(async () => {
      // Sperre gegen schnelle Doppelklicks (sonst zwei Anfragen, Zaehler springt)
      if (liking.current) return;
      liking.current = true;
      const before = post;
      if (!post.likedByMe) haptic(12);
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

  // Doppeltipp aufs Bild = Gefaellt mir (nie zurueck nehmen); einzelner Tipp vergroessert das Bild
  const [imageIndex, setImageIndex] = useState(0);
  const tapImage = useDoubleTap(
    () => setLightbox(imageIndex),
    () => {
      setBurst((b) => b + 1);
      if (!post.likedByMe) void like();
    },
  );

  const toggleCommentLike = (c: CommentItem) => {
    const before = comments;
    const liked = !c.likedByMe;
    if (liked) haptic(12);
    setComments((list) => (list ?? []).map((x) => (x.id === c.id ? { ...x, likedByMe: liked, likes: Math.max(0, (x.likes ?? 0) + (liked ? 1 : -1)) } : x)));
    api<{ liked: boolean; likes: number }>(`/comments/${c.id}/like`, { method: "POST", body: {} })
      .then((r) => setComments((list) => (list ?? []).map((x) => (x.id === c.id ? { ...x, likedByMe: r.liked, likes: r.likes } : x))))
      .catch((e) => {
        setComments(before);
        toast.error(describeError(e));
      });
  };

  /** Antworten: eine Ebene. Auf eine Antwort antwortet man beim Elternkommentar und erwaehnt die Person. */
  const startReply = (c: CommentItem) => {
    const parentId = c.parentId ?? c.id;
    setReplyTo({ parentId, name: c.author.name });
    setDraft(c.author.handle && c.author.id !== user?.id ? `@${c.author.handle} ` : "");
    setTimeout(() => draftRef.current?.focus(), 0);
  };

  const toggleComments = () =>
    run(async () => {
      if (!open && comments === null) setComments(await api<CommentItem[]>(`/posts/${post.id}/comments`));
      setOpen((o) => !o);
    });

  const addComment = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    void run(async () => {
      const c = await api<CommentItem>(`/posts/${post.id}/comments`, { method: "POST", body: { body: draft, ...(replyTo ? { parentId: replyTo.parentId } : {}) } });
      setComments((list) => [...(list ?? []), c]);
      setPost((p) => ({ ...p, comments: p.comments + 1 }));
      setDraft("");
      setReplyTo(null);
    });
  };

  // Loeschen: eigene Kommentare und alle Kommentare unter dem eigenen persoenlichen Beitrag
  const canDeleteComment = (c: CommentItem) => !!user && (c.author.id === user.id || (post.author.id === user.id && !post.org));
  const deleteComment = async (c: CommentItem) => {
    if (!(await ask("Kommentar löschen? Das lässt sich nicht rückgängig machen.", { confirmLabel: "Löschen", danger: true }))) return;
    try {
      await api(`/comments/${c.id}`, { method: "DELETE" });
      const gone = (comments ?? []).filter((x) => x.id === c.id || x.parentId === c.id).length; // Antworten verschwinden mit
      setComments((list) => (list ?? []).filter((x) => x.id !== c.id && x.parentId !== c.id));
      setPost((p) => ({ ...p, comments: Math.max(0, p.comments - gone) }));
      if (replyTo?.parentId === c.id) setReplyTo(null);
      toast.success("Kommentar gelöscht.");
    } catch (e) {
      toast.error(describeError(e));
    }
  };

  const report = (reason: ReportReason) =>
    run(async () => {
      const url = reportTarget.kind === "post" ? `/posts/${post.id}/report` : `/comments/${reportTarget.id}/report`;
      await api(url, { method: "POST", body: { reason } });
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
    if (!(await ask("Beitrag löschen? Das lässt sich nicht rückgängig machen.", { confirmLabel: "Löschen", danger: true }))) return;
    await run(async () => {
      await api(`/posts/${post.id}`, { method: "DELETE" });
      onDeleted(post.id);
    });
  };

  const saveEdit = (e: FormEvent) => {
    e.preventDefault();
    void runEdit(async () => {
      setError(null);
      try {
        const updated = await api<FeedPost>(`/posts/${post.id}`, { method: "PATCH", body: { body: edit.body, tags: edit.tags } });
        setPost(updated);
        setPanel("none");
        toast.success("Beitrag gespeichert.");
      } catch (err) {
        setError(describeError(err));
      }
    });
  };

  const openPanel = (p: "report" | "less" | "edit", target: ReportTarget = { kind: "post" }) => {
    setError(null);
    setReportTarget(target);
    if (p === "edit") setEdit({ body: post.body, tags: post.tags });
    setPanel(p);
  };
  const closePanel = () => {
    setPanel("none");
    setError(null);
  };

  const share = () => void shareLink(post.org?.name ?? post.author.name, postHref(post.id));

  const entries: Record<string, MenuEntry> = {
    why: { id: "why", label: why ? "Begründung ausblenden" : "Warum sehe ich das?", icon: Info, onSelect: () => setWhy((w) => !w) },
    edit: { id: "edit", label: "Bearbeiten", icon: Pencil, onSelect: () => openPanel("edit") },
    share: { id: "share", label: "Teilen", icon: Share2, onSelect: share },
    story: { id: "story", label: "Als Story teilen", icon: ImageIcon, onSelect: () => void import("@/lib/story-share").then((m) => m.sharePostStory(post)) },
    less: { id: "less", label: "Weniger davon …", icon: EyeOff, onSelect: () => openPanel("less") },
    report: { id: "report", label: "Melden …", icon: Flag, onSelect: () => openPanel("report") },
    delete: { id: "delete", label: "Löschen", icon: Trash2, danger: true, onSelect: () => void remove() },
  };
  const menu: MenuEntry[] = postMenuIds(post, showReason).flatMap((id) =>
    id === "delete" ? [{ type: "separator" as const, id: "sep" }, entries.delete] : [entries[id]],
  );

  const commentMenu = (c: CommentItem): MenuEntry[] => [
    ...(user && c.author.id !== user.id
      ? [{ id: "report", label: "Melden …", icon: Flag, onSelect: () => openPanel("report", { kind: "comment", id: c.id }) }]
      : []),
    ...(canDeleteComment(c) ? [{ id: "delete", label: "Löschen", icon: Trash2, danger: true, onSelect: () => void deleteComment(c) }] : []),
  ];

  const mediaIds = post.media.map((m) => m.id);

  // Antworten (eine Ebene) unter ihren Elternkommentar; Antworten ohne geladenen Elternkommentar zaehlen als eigene Kommentare
  const threads = useMemo(() => {
    const list = comments ?? [];
    const ids = new Set(list.map((c) => c.id));
    const top = list.filter((c) => !c.parentId || !ids.has(c.parentId));
    return top.map((c) => ({ comment: c, replies: list.filter((r) => r.parentId === c.id) }));
  }, [comments]);

  const renderComment = (c: CommentItem) => {
    const items = commentMenu(c);
    return (
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <UserNameLink handle={c.author.handle} name={c.author.name} className="font-medium" />{" "}
          <span className="text-xs text-muted">{timeAgo(c.createdAt)}</span>
          <p className="break-words">
            <RichText text={c.body} />
          </p>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted">
            <button
              type="button"
              aria-pressed={!!c.likedByMe}
              aria-label={`Kommentar von ${c.author.name}: Gefällt mir${c.likes ? `, ${c.likes}` : ""}`}
              onClick={() => toggleCommentLike(c)}
              className="hit-area relative inline-flex items-center gap-1 hover:text-text"
            >
              <Heart size={13} aria-hidden className={clsx(c.likedByMe && "fill-current text-like")} />
              {c.likes ? <span>{c.likes}</span> : null}
            </button>
            <button type="button" onClick={() => startReply(c)} className="hit-area relative font-medium hover:text-text">
              Antworten
            </button>
          </div>
        </div>
        {items.length > 0 && <DropdownMenu label={`Optionen für Kommentar von ${c.author.name}`} items={items} triggerClassName="h-7 w-7" />}
      </div>
    );
  };

  return (
    <Card>
      <div className="flex items-start gap-3">
        {post.org ? (
          <Avatar name={post.org.name} mediaId={post.org.logoId} kind="org" size={42} />
        ) : (
          <UserAvatarLink handle={post.author.handle} name={post.author.name} mediaId={post.author.avatarId} size={42} decorative />
        )}
        <div className="min-w-0 flex-1">
          {/* Zeile 1: Name (+ Badge), Zeile 2: @Handle · Zeit · bearbeitet */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {post.org ? (
              <Link href={`/vereine/${post.org.slug}`} className="font-bold tracking-tight hover:underline">{post.org.name}</Link>
            ) : (
              <UserNameLink handle={post.author.handle} name={post.author.name} className="font-bold tracking-tight" />
            )}
            {post.kind === "event" && <Badge tone="brand">Termin</Badge>}
            {/* Spenden sind noch nicht gebaut ("Kommt später"): kein Badge "Spendenaktion" anzeigen */}
          </div>
          <div className="flex flex-wrap items-center gap-x-1 text-xs text-muted">
            {!post.org && post.author.handle && <span className="truncate">@{post.author.handle} ·</span>}
            {post.org && <span>Verein ·</span>}
            <Link href={postHref(post.id)} className="hover:underline">
              <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
            </Link>
            {post.editedAt && (
              <span title={`Bearbeitet am ${new Date(post.editedAt).toLocaleString("de-DE")}`}>· bearbeitet</span>
            )}
          </div>

          {post.body && (
            <p className="mt-2.5 whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed">
              <RichText text={post.body} />
            </p>
          )}

          {post.media.length > 0 && (
            <div className={clsx("relative mt-3 grid gap-1 overflow-hidden rounded-2xl", post.media.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
              {post.media.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setImageIndex(i);
                    tapImage();
                  }}
                  aria-label={`Bild ${i + 1} von ${post.media.length} vergrößern`}
                  className={clsx("press block overflow-hidden bg-surface-2", post.media.length === 1 ? "" : "aspect-square", post.media.length === 3 && i === 0 && "row-span-2 aspect-auto")}
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
              {burst > 0 && (
                <span key={burst} aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <Heart size={88} className="animate-heart fill-current text-like drop-shadow-lg" />
                </span>
              )}
            </div>
          )}

          {post.poll && <PollView postId={post.id} poll={post.poll} onChange={(poll) => setPost((p) => ({ ...p, poll }))} />}

          <TagChips tags={post.tags} to="/tags" className="mt-3" />

          <div className="-ml-2 mt-2 flex items-center gap-0.5 text-sm text-muted">
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={post.likedByMe}
              aria-label="Gefällt mir"
              onClick={like}
              className="px-2"
            >
              {/* key: Herz ploppt bei jedem Wechsel neu auf */}
              <Heart key={String(post.likedByMe)} size={18} aria-hidden className={clsx(post.likedByMe && "animate-pop fill-current text-like")} />
              {post.likes === 0 && <span aria-hidden>0</span>}
            </Button>
            {post.likes > 0 && (
              <button
                type="button"
                onClick={() => setLikers(true)}
                aria-label={`${post.likes} ${post.likes === 1 ? "Person gefällt" : "Personen gefällt"} das, Liste anzeigen`}
                className="hit-area relative -ml-1 mr-1 rounded-md px-1 text-sm hover:underline"
              >
                {post.likes}
              </button>
            )}
            <Button variant="ghost" size="sm" aria-expanded={open} aria-label={`Kommentare, ${post.comments}`} onClick={toggleComments}>
              <MessageCircle size={18} aria-hidden /> {post.comments}
            </Button>
            <Button variant="ghost" size="sm" aria-label="Beitrag teilen" onClick={share}>
              <Share2 size={17} aria-hidden />
            </Button>
            <span className="ml-auto">
              <DropdownMenu label="Beitragsoptionen" items={menu} />
            </span>
          </div>

          {why && showReason && (
            <p id={`why-${post.id}`} className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
              <span className="font-medium">Warum du das siehst: </span>
              {post.reason}
            </p>
          )}
          {error && panel === "none" && <div className="mt-2"><Alert>{error}</Alert></div>}

          {open && (
            <div className="mt-3 border-t border-border pt-3">
              <ul className="space-y-3">
                {threads.map((t) => (
                  <li key={t.comment.id} className="text-sm">
                    {renderComment(t.comment)}
                    {t.replies.length > 0 && (
                      <ul className="ml-6 mt-2 space-y-2 border-l border-border pl-3">
                        {t.replies.map((r) => (
                          <li key={r.id}>{renderComment(r)}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
                {comments?.length === 0 && <li className="text-xs text-muted">Noch keine Kommentare.</li>}
              </ul>
              {replyTo && (
                <p className="mt-3 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-muted">
                  <span>Antwort an {replyTo.name}</span>
                  <button type="button" onClick={() => { setReplyTo(null); setDraft(""); }} className="hit-area relative rounded px-1 font-medium text-brand hover:underline">
                    Abbrechen
                  </button>
                </p>
              )}
              <form onSubmit={addComment} className="mt-3 flex gap-2">
                <label htmlFor={`c-${post.id}`} className="sr-only">{replyTo ? `Antwort an ${replyTo.name}` : "Kommentar"}</label>
                <Input
                  ref={draftRef}
                  id={`c-${post.id}`}
                  size="sm"
                  value={draft}
                  maxLength={500}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={replyTo ? "Antwort schreiben …" : "Kommentar schreiben …"}
                  className="min-w-0 flex-1"
                />
                <Button type="submit" size="sm" disabled={!draft.trim()}>Senden</Button>
              </form>
            </div>
          )}
        </div>
      </div>
      {lightbox !== null && <LazyLightbox ids={mediaIds} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}

      <LikersSheet postId={post.id} open={likers} onClose={() => setLikers(false)} />

      <Dialog
        open={panel === "less"}
        onClose={closePanel}
        title="Weniger davon"
        description="Was möchtest du weniger sehen?"
        placement="sheet"
        size="sm"
      >
        <div className="space-y-2">
          {error && <Alert>{error}</Alert>}
          <Button variant="secondary" className="w-full" onClick={() => less("hide")}>Diesen Beitrag ausblenden</Button>
          {post.org ? (
            <Button variant="secondary" className="w-full" onClick={() => less("mute_org")}>{post.org.name} stummschalten</Button>
          ) : (
            post.canDelete === false && (
              <Button variant="secondary" className="w-full" onClick={() => less("mute_author")}>{post.author.name} stummschalten</Button>
            )
          )}
        </div>
      </Dialog>

      <Dialog
        open={panel === "report"}
        onClose={closePanel}
        title={reportTarget.kind === "comment" ? "Kommentar melden" : "Beitrag melden"}
        description={`Warum meldest du diesen ${reportTarget.kind === "comment" ? "Kommentar" : "Beitrag"}? Die Moderation prüft ihn.`}
        placement="sheet"
        size="sm"
      >
        <div className="space-y-2" role="group" aria-label="Grund der Meldung">
          {error && <Alert>{error}</Alert>}
          {REPORT_REASONS.map((r) => (
            <Button key={r.id} variant="secondary" className="w-full" onClick={() => report(r.id)}>{r.label}</Button>
          ))}
        </div>
      </Dialog>

      <Dialog open={panel === "edit"} onClose={closePanel} title="Beitrag bearbeiten" description="Text und Tags kannst du ändern, Bilder bleiben." size="md">
        <form onSubmit={saveEdit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <TextareaField
            id={`edit-${post.id}`}
            label="Text"
            rows={5}
            maxLength={1000}
            value={edit.body}
            onChange={(e) => setEdit((s) => ({ ...s, body: e.target.value }))}
            hint={`${edit.body.length}/1000${post.media.length ? " · ohne Text bleibt nur das Bild" : ""}`}
          />
          <TagPicker label="Tags (optional)" value={edit.tags} onChange={(tags) => setEdit((s) => ({ ...s, tags }))} max={MAX_POST_TAGS} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closePanel}>Abbrechen</Button>
            <Button type="submit" busy={editBusy} disabled={!edit.body.trim() && post.media.length === 0}>Speichern</Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
