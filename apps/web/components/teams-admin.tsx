"use client";

import { useCallback, useEffect, useState } from "react";
import type { MemberItem, TeamItem, TeamMemberItem } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { Button, Card, Field } from "./ui";

export function TeamsAdmin({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const [teams, setTeams] = useState<TeamItem[] | null>(null);
  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMemberItem[]>([]);
  const [candidates, setCandidates] = useState<MemberItem[]>([]);

  const load = useCallback(() => {
    api<TeamItem[]>(`/orgs/${slug}/teams`).then(setTeams).catch((e) => onError(describeError(e)));
  }, [slug, onError]);

  useEffect(() => {
    setTeams(null);
    setOpen(null);
    load();
  }, [load]);

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
            void run(async () => {
              await api(`/orgs/${slug}/teams`, { method: "POST", body: { name } });
              setName("");
              load();
            });
          }}
        >
          <div className="min-w-48 flex-1">
            <Field id="team-name" label="Neues Team (z. B. Herren, U12)" value={name} minLength={2} maxLength={60} required onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit">Team anlegen</Button>
        </form>
      </Card>

      {teams === null ? (
        <p className="text-sm text-muted" role="status">Lade …</p>
      ) : teams.length === 0 ? (
        <Card><p className="text-sm text-muted">Noch keine Teams.</p></Card>
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
                      onClick={() =>
                        confirm(`Team „${t.name}“ samt Terminen löschen?`) &&
                        run(async () => {
                          await api(`/orgs/${slug}/teams/${t.id}`, { method: "DELETE" });
                          load();
                        })
                      }
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
                            className="rounded-full px-2 text-muted hover:text-danger"
                            onClick={() =>
                              run(async () => {
                                await api(`/orgs/${slug}/teams/${t.id}/members/${m.userId}`, { method: "DELETE" });
                                await refreshOpen(t.id);
                              })
                            }
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div>
                      <label htmlFor={`add-${t.id}`} className="sr-only">Mitglied hinzufügen</label>
                      <select
                        id={`add-${t.id}`}
                        value=""
                        onChange={(e) =>
                          e.target.value &&
                          run(async () => {
                            await api(`/orgs/${slug}/teams/${t.id}/members/${e.target.value}`, { method: "PUT" });
                            await refreshOpen(t.id);
                          })
                        }
                        className="h-9 rounded-lg border border-border bg-bg px-2 text-sm"
                      >
                        <option value="">Mitglied hinzufügen …</option>
                        {candidates
                          .filter((c) => !members.some((m) => m.userId === c.userId))
                          .map((c) => (
                            <option key={c.userId} value={c.userId}>{c.name}</option>
                          ))}
                      </select>
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
