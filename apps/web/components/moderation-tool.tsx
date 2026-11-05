"use client";

import clsx from "clsx";
import { Eye, EyeOff, MessageSquareX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { tagLabel, type ModerationCommentItem, type ModerationPostItem } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { ModerationQueue } from "./moderation-queue";
import { Badge, Button, Card, CardSkeletons } from "./ui";
import { ask, toast } from "./ui-hosts";

type Section = "reports" | "posts" | "comments";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "reports", label: "Meldungen" },
  { id: "posts", label: "Beiträge" },
  { id: "comments", label: "Kommentare" },
];
const when = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Moderation des Vereins: offene Meldungen, alle Beitraege (ausblenden/einblenden mit Begruendung) und
 * Kommentare (loeschen). Jede Aktion wird protokolliert; ausgeblendete Beitraege bleiben mit Grund gespeichert (DSA).
 */
export function ModerationTool({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const [section, setSection] = useState<Section>("reports");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Moderationsbereich" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={clsx("h-9 rounded-md px-4 text-sm font-medium", section === s.id ? "bg-brand text-brand-contrast" : "text-muted hover:text-text")}
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === "reports" && <ModerationQueue slug={slug} onError={onError} />}
      {section === "posts" && <PostsPanel slug={slug} onError={onError} />}
      {section === "comments" && <CommentsPanel slug={slug} onError={onError} />}
    </div>
  );
}

function PostsPanel({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const [filter, setFilter] = useState<"all" | "reported" | "hidden">("all");
  const [rows, setRows] = useState<ModerationPostItem[] | null>(null);
  const [hiding, setHiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    api<ModerationPostItem[]>(`/orgs/${slug}/moderation/posts?filter=${filter}`).then(setRows).catch((e) => onError(describeError(e)));
  }, [slug, filter, onError]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  async function act(id: string, body: object) {
    onError(null);
    try {
      await api(`/posts/${id}/moderation`, { method: "POST", body });
      setHiding(null);
      setReason("");
      toast.success("Gespeichert");
      load();
    } catch (e) {
      onError(describeError(e));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
        {([["all", "Alle"], ["reported", "Gemeldet"], ["hidden", "Ausgeblendet"]] as const).map(([id, label]) => (
          <Button key={id} size="sm" variant={filter === id ? "primary" : "secondary"} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</Button>
        ))}
      </div>
      {rows === null ? (
        <CardSkeletons count={2} />
      ) : rows.length === 0 ? (
        <Card><p className="text-sm text-muted">Keine Beiträge in dieser Ansicht.</p></Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => (
            <li key={p.id}>
              <Card className={clsx(p.hidden && "opacity-80")}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-medium text-text">{p.authorName}</span>
                  <span>{when(p.createdAt)}</span>
                  {p.hidden && <Badge tone="danger">ausgeblendet</Badge>}
                  {p.openReports > 0 && <Badge tone="accent">{p.openReports} {p.openReports === 1 ? "Meldung" : "Meldungen"}</Badge>}
                  <span>{p.comments} Kommentare</span>
                  {p.tags.map((t) => <Badge key={t}>{tagLabel(t)}</Badge>)}
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">{p.body || "(nur Bild)"}</p>
                {p.hidden && p.hiddenReason && <p className="mt-1 text-xs text-muted">Grund: {p.hiddenReason}</p>}

                {hiding === p.id ? (
                  <div className="mt-3 space-y-2">
                    <label htmlFor={`why-${p.id}`} className="text-xs font-medium">Begründung (wird dem Autor mitgeteilt, mind. 10 Zeichen)</label>
                    <textarea
                      id={`why-${p.id}`}
                      rows={2}
                      maxLength={500}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full resize-none rounded-lg border border-border bg-bg p-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="danger" disabled={reason.trim().length < 10} onClick={() => act(p.id, { action: "hide", reason })}>Ausblenden</Button>
                      <Button size="sm" variant="ghost" onClick={() => setHiding(null)}>Abbrechen</Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3">
                    {p.hidden ? (
                      <Button size="sm" variant="secondary" onClick={() => act(p.id, { action: "unhide" })}><Eye size={14} aria-hidden /> Wieder einblenden</Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setHiding(p.id)}><EyeOff size={14} aria-hidden /> Ausblenden …</Button>
                    )}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentsPanel({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const [rows, setRows] = useState<ModerationCommentItem[] | null>(null);
  const load = useCallback(() => {
    api<ModerationCommentItem[]>(`/orgs/${slug}/moderation/comments`).then(setRows).catch((e) => onError(describeError(e)));
  }, [slug, onError]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  async function remove(id: string) {
    if (!(await ask("Kommentar endgültig löschen?", { confirmLabel: "Ja" }))) return;
    onError(null);
    try {
      await api(`/moderation/comments/${id}`, { method: "DELETE", body: {} });
      toast.success("Kommentar gelöscht");
      load();
    } catch (e) {
      onError(describeError(e));
    }
  }

  if (rows === null) return <CardSkeletons count={2} />;
  if (rows.length === 0) return <Card><p className="text-sm text-muted">Noch keine Kommentare unter Vereinsbeiträgen.</p></Card>;
  return (
    <Card className="divide-y divide-border p-0">
      {rows.map((c) => (
        <div key={c.id} className="flex items-start gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted"><span className="font-medium text-text">{c.authorName}</span> · {when(c.createdAt)} · unter „{c.postExcerpt}“</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
          </div>
          <Button size="sm" variant="ghost" aria-label="Kommentar löschen" onClick={() => remove(c.id)}><MessageSquareX size={16} aria-hidden /></Button>
        </div>
      ))}
    </Card>
  );
}
