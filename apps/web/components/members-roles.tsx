"use client";

import { useCallback, useEffect, useState } from "react";
import { ORG_ROLES, type MemberItem, type OrgRole } from "@vereine/shared";
import { Button, Card } from "./ui";
import { api, describeError } from "@/lib/api";

const roleLabel: Record<OrgRole, string> = { admin: "Vorstand", treasurer: "Kassenwart", moderator: "Moderation", member: "Mitglied" };

/** Anträge (mode "pending") und Rollenverwaltung (mode "active"). */
export function MembersManager({
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
