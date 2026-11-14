"use client";

import { useState } from "react";
import { GUARDIAN_INVITE_VALID_DAYS, MAX_GUARDIANS_PER_CHILD, type YouthGuardiansView } from "@vereine/shared";
import { Alert, Badge, Button, Card, Field, SectionTitle } from "@/components/ui";
import { ask, toast } from "@/components/ui-hosts";
import { api, describeError } from "@/lib/api";
import { dateDe } from "@/lib/money";
import { useApi, useBusy } from "@/lib/use-api";

/**
 * Eltern eines Kindes: zweiten Elternteil per Mail einladen, Rechnungsempfaenger wechseln.
 * Beide Eltern sehen und verwalten das Kind; Freigaben gelten restriktiv (ein Widerspruch genuegt).
 */
export function KindGuardians({ childId, childName, paused, onChanged }: { childId: string; childName: string; paused: boolean; onChanged: () => void }) {
  const view = useApi<YouthGuardiansView>(`/guardian/children/${childId}/guardians`);
  const [busy, run] = useBusy();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const v = view.data;
  if (!v) return null;

  const reload = () => {
    view.reload();
    onChanged();
  };

  const invite = () =>
    void run(async () => {
      setError(null);
      try {
        await api(`/guardian/children/${childId}/guardians`, { method: "POST", body: { email } });
        setEmail("");
        toast.success("Die Einladung ist unterwegs.");
        reload();
      } catch (e) {
        setError(describeError(e));
      }
    });

  const revoke = (id: string) =>
    void run(async () => {
      try {
        await api(`/guardian/children/${childId}/guardian-invites/${id}`, { method: "DELETE" });
        toast.success("Einladung zurückgezogen.");
        reload();
      } catch (e) {
        toast.error(describeError(e));
      }
    });

  const makeBilling = (userId: string, name: string) =>
    void run(async () => {
      if (!(await ask(`${name} zum Rechnungsempfänger für ${childName} machen? Neue Rechnungen gehen dann dorthin, bereits gestellte bleiben beim bisherigen Empfänger. Beide Eltern bekommen einen Hinweis.`, { confirmLabel: "Wechseln", title: "Rechnungsempfänger wechseln" }))) return;
      try {
        await api(`/guardian/children/${childId}/billing-contact`, { method: "PUT", body: { guardianId: userId } });
        toast.success("Der Rechnungsempfänger wurde gewechselt.");
        reload();
      } catch (e) {
        toast.error(describeError(e));
      }
    });

  return (
    <>
      <SectionTitle>Eltern</SectionTitle>
      <Card flush className="mb-6">
        <ul className="divide-y divide-border">
          {v.guardians.map((g) => (
            <li key={g.userId} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{g.isMe ? `${g.name} (du)` : g.name}</p>
                <p className="text-xs text-muted">Seit {dateDe(g.since.slice(0, 10))}</p>
              </div>
              {g.isBillingContact ? (
                <Badge tone="brand">Rechnungsempfänger</Badge>
              ) : (
                v.guardians.length > 1 &&
                !paused && (
                  <Button size="sm" variant="secondary" className="relative hit-area" disabled={busy} onClick={() => makeBilling(g.userId, g.isMe ? "Dich" : g.name)}>
                    {g.isMe ? "Rechnungen an mich" : "Rechnungen dorthin"}
                  </Button>
                )
              )}
            </li>
          ))}
          {v.invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">Einladung offen</p>
                <p className="text-xs text-muted">Gültig bis {dateDe(i.expiresAt.slice(0, 10))}. Die Person nimmt sie mit ihrem eigenen Konto an.</p>
              </div>
              <Button size="sm" variant="secondary" className="relative hit-area" disabled={busy} onClick={() => revoke(i.id)}>Zurückziehen</Button>
            </li>
          ))}
        </ul>
        {v.canInvite && (
          <form
            className="space-y-3 border-t border-border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) invite();
            }}
          >
            {error && <Alert>{error}</Alert>}
            <Field
              id="eltern-einladung-mail"
              label="Zweiten Elternteil einladen"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              hint={`Wir schicken einen Link an diese Adresse (${GUARDIAN_INVITE_VALID_DAYS} Tage gültig). Er funktioniert nur mit einem eigenen, bestätigten Konto mit genau dieser Adresse. Die Adresse speichern wir nicht.`}
            />
            <Button type="submit" variant="secondary" className="relative hit-area" busy={busy} disabled={email.trim() === ""}>Einladung schicken</Button>
          </form>
        )}
      </Card>
      <p className="mb-6 px-1 text-xs text-muted">
        Höchstens {MAX_GUARDIANS_PER_CHILD} Eltern je Kind. Beide sehen und verwalten {childName}. Freigaben gelten restriktiv: Widerspricht einer von euch (zum Beispiel durch den Austritt aus einem Verein), kann der andere die Mitgliedschaft nicht allein erneut erteilen.
      </p>
    </>
  );
}
