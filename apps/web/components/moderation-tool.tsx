"use client";

import clsx from "clsx";
import { Eye, EyeOff, MessageSquareX } from "lucide-react";
import { useState } from "react";
import { tagLabel, type ModerationCommentItem, type ModerationPostItem } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { ReportQueue } from "./moderation-queue";
import { Badge, Button, Card, CardSkeletons, EmptyState, ErrorState, TextareaField } from "./ui";
import { SegmentedControl, tabPanelProps } from "./ui-client";
import { ask, toast } from "./ui-hosts";

type Section = "reports" | "posts" | "comments";
const SECTIONS: { value: Section; label: string }[] = [
  { value: "reports", label: "Meldungen" },
  { value: "posts", label: "Beiträge" },
  { value: "comments", label: "Kommentare" },
];
type Filter = "all" | "reported" | "hidden";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "reported", label: "Gemeldet" },
  { value: "hidden", label: "Ausgeblendet" },
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
      <SegmentedControl
        aria-label="Moderationsbereich"
        mode="tabs"
        idBase="mod"
        panelId="mod-panel"
        options={SECTIONS}
        value={section}
        onChange={setSection}
      />
      <div {...tabPanelProps("mod", "mod-panel", section)} className="focus:outline-none">
        {section === "reports" && (
          <ReportQueue
            listPath={`/orgs/${slug}/reports`}
            resolvePath={(id) => `/reports/${id}/resolve`}
            emptyText="Keine offenen Meldungen."
            onError={onError}
          />
        )}
        {section === "posts" && <PostsPanel slug={slug} onError={onError} />}
        {section === "comments" && <CommentsPanel slug={slug} onError={onError} />}
      </div>
    </div>
  );
}

function PostsPanel({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const list = useApi<ModerationPostItem[]>(`/orgs/${slug}/moderation/posts?filter=${filter}`);
  const [hiding, setHiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function act(id: string, body: object) {
    onError(null);
    try {
      await api(`/posts/${id}/moderation`, { method: "POST", body });
      setHiding(null);
      setReason("");
      toast.success("Gespeichert");
      list.reload();
    } catch (e) {
      onError(describeError(e));
    }
  }

  let content;
  if (list.error && !list.data) content = <ErrorState message={list.error} onRetry={list.reload} />;
  else if (!list.data) content = <CardSkeletons count={2} />;
  else if (!list.data.length) content = <EmptyState title="Keine Beiträge in dieser Ansicht." />;
  else
    content = (
      <ul className="space-y-3">
        {list.data.map((p) => (
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
                  <TextareaField
                    id={`why-${p.id}`}
                    label="Begründung (wird dem Autor mitgeteilt, mind. 10 Zeichen)"
                    rows={2}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
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
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setReason("");
                        setHiding(p.id);
                      }}
                    >
                      <EyeOff size={14} aria-hidden /> Ausblenden …
                    </Button>
                  )}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-3">
      <SegmentedControl aria-label="Filter" mode="radio" variant="pills" options={FILTERS} value={filter} onChange={setFilter} />
      {content}
    </div>
  );
}

function CommentsPanel({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const list = useApi<ModerationCommentItem[]>(`/orgs/${slug}/moderation/comments`);

  async function remove(id: string) {
    if (!(await ask("Kommentar endgültig löschen?", { confirmLabel: "Löschen" }))) return;
    onError(null);
    try {
      await api(`/moderation/comments/${id}`, { method: "DELETE", body: {} });
      toast.success("Kommentar gelöscht");
      list.setData((l) => l?.filter((c) => c.id !== id) ?? l);
    } catch (e) {
      onError(describeError(e));
    }
  }

  if (list.error && !list.data) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data) return <CardSkeletons count={2} />;
  if (!list.data.length) return <EmptyState title="Noch keine Kommentare unter Vereinsbeiträgen." />;
  return (
    <Card flush className="divide-y divide-border">
      {list.data.map((c) => (
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
