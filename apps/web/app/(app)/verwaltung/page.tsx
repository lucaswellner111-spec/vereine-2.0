"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ORG_ROLES, type MemberItem, type OrgDetail, type OrgRole, type OrgSummary, type ReportItem } from "@vereine/shared";
import { Alert, Badge, Button, Card, PageHeader } from "@/components/ui";
import { InvoicesAdmin } from "@/components/invoices-admin";
import { BillingProfileAdmin, InvitesAdmin } from "@/components/org-onboarding-admin";
import { EventsAdmin } from "@/components/events-admin";
import { TeamsAdmin } from "@/components/teams-admin";
import { api, describeError } from "@/lib/api";

const roleLabel: Record<OrgRole, string> = { admin: "Vorstand", treasurer: "Kassenwart", moderator: "Moderation", member: "Mitglied" };
const reasonLabel: Record<string, string> = { spam: "Spam", hate: "Hass / Hetze", illegal: "Illegal", other: "Sonstiges" };

type Tab = "Anträge" | "Mitglieder" | "Einladungen" | "Teams" | "Termine" | "Moderation" | "Rechnungen" | "Stammdaten";

export default function AdminPage() {
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [slug, setSlug] = useState<string>("");
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [tab, setTab] = useState<Tab>("Anträge");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OrgSummary[]>("/orgs/managed")
      .then((o) => {
        setOrgs(o);
        if (o[0]) setSlug(o[0].slug);
      })
      .catch((e) => setError(describeError(e)));
  }, []);

  const refresh = useCallback(() => {
    if (!slug) return;
    api<OrgDetail>(`/orgs/${slug}`).then(setDetail).catch((e) => setError(describeError(e)));
  }, [slug]);

  useEffect(() => {
    setDetail(null);
    refresh();
  }, [refresh]);

  const role = detail?.viewer.role;
  const tabs: Tab[] =
    role === "admin"
      ? ["Anträge", "Mitglieder", "Einladungen", "Teams", "Termine", "Moderation", "Rechnungen", "Stammdaten"]
      : role === "treasurer"
        ? ["Rechnungen", "Stammdaten"]
        : ["Termine", "Moderation"];

  useEffect(() => {
    if (detail && !tabs.includes(tab)) setTab(tabs[0]);
  }, [detail]); // eslint-disable-line react-hooks/exhaustive-deps

  if (orgs === null) return <p className="text-sm text-muted" role="status">{error ?? "Lade …"}</p>;

  if (orgs.length === 0) {
    return (
      <>
        <PageHeader title="Verwaltung" subtitle="Hier verwaltest du deine Vereine." />
        <Card>
          <p className="text-sm">Du bist noch in keinem Vorstand oder in der Moderation eines Vereins.</p>
          <Link href="/vereine/neu" className="mt-3 inline-block text-sm font-medium text-brand hover:underline">Verein gründen →</Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Verwaltung"
        subtitle={detail ? `${detail.members} ${detail.members === 1 ? "Mitglied" : "Mitglieder"} · ${detail.followers} Follower` : "Lade …"}
        action={
          <div>
            <label htmlFor="org" className="sr-only">Verein</label>
            <select
              id="org"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
            >
              {orgs.map((o) => (
                <option key={o.slug} value={o.slug}>{o.name}</option>
              ))}
            </select>
          </div>
        }
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div role="tablist" className="mb-4 inline-flex flex-wrap rounded-lg border border-border bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={clsx("rounded-md px-3 py-1.5 text-sm font-medium", tab === t ? "bg-brand text-brand-contrast" : "text-muted hover:text-text")}
          >
            {t}
          </button>
        ))}
      </div>

      {detail && slug && tab === "Anträge" && <Members slug={slug} mode="pending" onError={setError} onChanged={refresh} />}
      {detail && slug && tab === "Mitglieder" && <Members slug={slug} mode="active" onError={setError} onChanged={refresh} />}
      {detail && slug && tab === "Einladungen" && <InvitesAdmin slug={slug} onError={setError} />}
      {detail && slug && tab === "Stammdaten" && <BillingProfileAdmin slug={slug} canEdit={role === "admin"} onError={setError} />}
      {detail && slug && tab === "Teams" && <TeamsAdmin slug={slug} onError={setError} />}
      {detail && slug && tab === "Termine" && <EventsAdmin slug={slug} onError={setError} />}
      {detail && slug && tab === "Moderation" && <Moderation slug={slug} onError={setError} />}
      {detail && slug && tab === "Rechnungen" && <InvoicesAdmin slug={slug} onError={setError} />}
    </>
  );
}

function Members({
  slug,
  mode,
  onError,
  onChanged,
}: {
  slug: string;
  mode: "pending" | "active";
  onError: (m: string | null) => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<MemberItem[] | null>(null);

  const load = useCallback(() => {
    api<MemberItem[]>(`/orgs/${slug}/members?status=${mode}`).then(setRows).catch((e) => onError(describeError(e)));
  }, [slug, mode, onError]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    onError(null);
    try {
      await fn();
      load();
      onChanged();
    } catch (e) {
      onError(describeError(e));
    }
  };

  if (rows === null) return <p className="text-sm text-muted" role="status">Lade …</p>;
  if (rows.length === 0) return <Card><p className="text-sm text-muted">{mode === "pending" ? "Keine offenen Anträge." : "Noch keine Mitglieder."}</p></Card>;

  return (
    <Card className="divide-y divide-border p-0">
      {rows.map((m) => (
        <div key={m.userId} className="flex flex-wrap items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{m.name}</p>
            <p className="text-xs text-muted">seit {new Date(m.since).toLocaleDateString("de-DE")}</p>
          </div>
          {mode === "pending" ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => run(() => api(`/orgs/${slug}/members/${m.userId}/decision`, { method: "POST", body: { decision: "approve" } }))}>Annehmen</Button>
              <Button size="sm" variant="secondary" onClick={() => run(() => api(`/orgs/${slug}/members/${m.userId}/decision`, { method: "POST", body: { decision: "reject" } }))}>Ablehnen</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <label htmlFor={`role-${m.userId}`} className="sr-only">Rolle von {m.name}</label>
              <select
                id={`role-${m.userId}`}
                value={m.role}
                onChange={(e) => run(() => api(`/orgs/${slug}/members/${m.userId}/role`, { method: "PUT", body: { role: e.target.value } }))}
                className="h-8 rounded-lg border border-border bg-bg px-2 text-xs"
              >
                {ORG_ROLES.map((r) => (
                  <option key={r} value={r}>{roleLabel[r]}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => confirm(`${m.name} aus dem Verein entfernen?`) && run(() => api(`/orgs/${slug}/members/${m.userId}`, { method: "DELETE" }))}
              >
                Entfernen
              </Button>
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}

function Moderation({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const [items, setItems] = useState<ReportItem[] | null>(null);
  const [hiding, setHiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    api<ReportItem[]>(`/orgs/${slug}/reports`).then(setItems).catch((e) => onError(describeError(e)));
  }, [slug, onError]);
  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  async function resolve(id: string, body: object) {
    onError(null);
    try {
      await api(`/reports/${id}/resolve`, { method: "POST", body });
      setHiding(null);
      setReason("");
      load();
    } catch (e) {
      onError(describeError(e));
    }
  }

  if (items === null) return <p className="text-sm text-muted" role="status">Lade …</p>;
  if (items.length === 0) return <Card><p className="text-sm text-muted">Keine offenen Meldungen. 🎉</p></Card>;

  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <li key={r.id}>
          <Card>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge tone="danger">{reasonLabel[r.reason] ?? r.reason}</Badge>
              <span>{new Date(r.createdAt).toLocaleString("de-DE")}</span>
              <span>· Beitrag von {r.post.authorName}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{r.post.body}</p>
            {r.note && <p className="mt-1 text-xs text-muted">Hinweis: {r.note}</p>}
            {hiding === r.id ? (
              <div className="mt-3 space-y-2">
                <label htmlFor={`why-${r.id}`} className="text-xs font-medium">Begründung (wird dem Autor mitgeteilt)</label>
                <textarea
                  id={`why-${r.id}`}
                  rows={2}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full resize-none rounded-lg border border-border bg-bg p-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" disabled={reason.trim().length < 10} onClick={() => resolve(r.id, { action: "hide", reason })}>Ausblenden</Button>
                  <Button size="sm" variant="ghost" onClick={() => setHiding(null)}>Abbrechen</Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="danger" onClick={() => setHiding(r.id)}>Beitrag ausblenden …</Button>
                <Button size="sm" variant="secondary" onClick={() => resolve(r.id, { action: "dismiss" })}>Meldung ablehnen</Button>
              </div>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
