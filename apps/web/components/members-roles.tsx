"use client";

import { ORG_ROLES, type MemberItem, type OrgRole } from "@vereine/shared";
import { Button, Card, CardSkeletons, EmptyState, ErrorState, Select, UserNameLink } from "./ui";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";
import { useApi } from "@/lib/use-api";
import { ask } from "./ui-hosts";

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
  const { user } = useAuth();
  const list = useApi<MemberItem[]>(`/orgs/${slug}/members?status=${mode}`);

  const run = async (fn: () => Promise<unknown>) => {
    onError(null);
    try {
      await fn();
      list.reload();
      onChanged();
    } catch (e) {
      onError(describeError(e));
    }
  };

  async function changeRole(m: MemberItem, role: OrgRole) {
    if (role === m.role) return;
    // Das Select ist kontrolliert (value = m.role) und springt bei Abbruch von selbst zurueck.
    if (!(await ask(`Rolle von ${m.name} auf „${ROLE_LABEL[role]}“ ändern?`, { confirmLabel: "Ändern", danger: false }))) return;
    await run(() => api(`/orgs/${slug}/members/${m.userId}/role`, { method: "PUT", body: { role } }));
  }

  if (list.error && !list.data) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data) return <CardSkeletons count={2} />;
  if (!list.data.length) return <EmptyState title={mode === "pending" ? "Keine offenen Anträge." : "Noch keine Mitglieder."} />;

  return (
    <Card flush className="divide-y divide-border">
      {list.data.map((m) => {
        // Nur Oberflaeche: die eigene Rolle aendert ein anderer Vorstand (Server prueft selbst)
        const self = m.userId === user?.id;
        return (
          <div key={m.userId} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium"><UserNameLink handle={m.handle} name={m.name} /></p>
              <p className="text-xs text-muted">seit {new Date(m.since).toLocaleDateString("de-DE")}</p>
              {mode === "active" && self && <p className="mt-0.5 text-xs text-muted">Deine eigene Rolle kann ein anderer Vorstand ändern.</p>}
            </div>
            {mode === "pending" ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => run(() => api(`/orgs/${slug}/members/${m.userId}/decision`, { method: "POST", body: { decision: "approve" } }))}>Annehmen</Button>
                <Button size="sm" variant="secondary" onClick={() => run(() => api(`/orgs/${slug}/members/${m.userId}/decision`, { method: "POST", body: { decision: "reject" } }))}>Ablehnen</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label htmlFor={`role-${m.userId}`} className="sr-only">Rolle von {m.name}</label>
                <Select id={`role-${m.userId}`} size="sm" value={m.role} disabled={self} onChange={(e) => void changeRole(m, e.target.value as OrgRole)}>
                  {ORG_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={self}
                  onClick={async () => {
                    if (!(await ask(`${m.name} aus dem Verein entfernen?`, { confirmLabel: "Entfernen" }))) return;
                    await run(() => api(`/orgs/${slug}/members/${m.userId}`, { method: "DELETE" }));
                  }}
                >
                  Entfernen
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
