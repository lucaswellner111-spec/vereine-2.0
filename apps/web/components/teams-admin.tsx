"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { MemberItem, TeamItem, TeamMemberItem } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useApi, useBusy } from "@/lib/use-api";
import { Button, Card, CardSkeletons, EmptyState, ErrorState, Field, Select } from "./ui";
import { ask } from "./ui-hosts";

export function TeamsAdmin({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const list = useApi<TeamItem[]>(`/orgs/${slug}/teams`);
  const teams = list.data;
  const load = list.reload;
  const [creating, runCreate] = useBusy();
  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMemberItem[]>([]);
  const [candidates, setCandidates] = useState<MemberItem[]>([]);

  useEffect(() => setOpen(null), [slug]);

  const run = async (fn: () => Promise<unknown>) => {
    onError(null);
    try {
      await fn();
    } catch (e) {
      onError(describeError(e));
    }
  };

  async function openTeam(id: string) {
    if (open === id) return setOpen(null);
    await run(async () => {
      const [m, all] = await Promise.all([
        api<TeamMemberItem[]>(`/orgs/${slug}/teams/${id}/members`),
        api<MemberItem[]>(`/orgs/${slug}/members?status=active`),
      ]);
      setMembers(m);
      setCandidates(all);
      setOpen(id);
    });
  }

  const refreshOpen = async (id: string) => {
    setMembers(await api<TeamMemberItem[]>(`/orgs/${slug}/teams/${id}/members`));
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runCreate(() => run(async () => {
              await api(`/orgs/${slug}/teams`, { method: "POST", body: { name } });
              setName("");
              load();
            }));
          }}
        >
          <Field id="team-name" label="Neues Team (z. B. Herren, U12)" value={name} minLength={2} maxLength={60} required onChange={(e) => setName(e.target.value)} className="min-w-48 flex-1" />
          <Button type="submit" busy={creating}>Team anlegen</Button>
        </form>
      </Card>

      {list.error && !teams ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : teams === null ? (
        <CardSkeletons count={2} />
      ) : teams.length === 0 ? (
        <EmptyState title="Noch keine Teams." />
      ) : (
        <ul className="space-y-3">
          {teams.map((t) => (
            <li key={t.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted">{t.members} {t.members === 1 ? "Mitglied" : "Mitglieder"}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" aria-expanded={open === t.id} onClick={() => openTeam(t.id)}>Mitglieder</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (!(await ask(`Team „${t.name}“ samt Terminen löschen?`, { confirmLabel: "Löschen" }))) return;
                        await run(async () => {
                          await api(`/orgs/${slug}/teams/${t.id}`, { method: "DELETE" });
                          load();
                        });
                      }}
                    >
                      Löschen
                    </Button>
                  </div>
                </div>
                {open === t.id && (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    <ul className="flex flex-wrap gap-2">
                      {members.length === 0 && <li className="text-xs text-muted">Noch niemand im Team.</li>}
                      {members.map((m) => (
                        <li key={m.userId} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
                          {m.name}
                          <button
                            type="button"
                            aria-label={`${m.name} entfernen`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-danger"
                            onClick={async () => {
                              if (!(await ask(`${m.name} aus dem Team entfernen?`, { confirmLabel: "Entfernen" }))) return;
                              await run(async () => {
                                await api(`/orgs/${slug}/teams/${t.id}/members/${m.userId}`, { method: "DELETE" });
                                await refreshOpen(t.id);
                              });
                            }}
                          >
                            <X size={14} aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div>
                      <label htmlFor={`add-${t.id}`} className="sr-only">Mitglied hinzufügen</label>
                      <Select
                        id={`add-${t.id}`}
                        size="sm"
                        value=""
                        onChange={(e) => {
                          const userId = e.target.value;
                          if (!userId) return;
                          void run(async () => {
                            await api(`/orgs/${slug}/teams/${t.id}/members/${userId}`, { method: "PUT" });
                            await refreshOpen(t.id);
                          });
                        }}
                      >
                        <option value="">Mitglied hinzufügen …</option>
                        {candidates
                          .filter((c) => !members.some((m) => m.userId === c.userId))
                          .map((c) => (
                            <option key={c.userId} value={c.userId}>{c.name}</option>
                          ))}
                      </Select>
                    </div>
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
