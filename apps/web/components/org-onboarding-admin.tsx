"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { CreatedInvite, InviteItem, OrgBillingProfile } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useApi, useBusy } from "@/lib/use-api";
import { ask, toast } from "./ui-hosts";
import { CopyField } from "./ui-client";
import { Alert, Badge, Button, Card, CardSkeletons, EmptyState, ErrorState, Field, LinkButton, TextareaField } from "./ui";

const statusLabel = { active: "Aktiv", expired: "Abgelaufen", used_up: "Aufgebraucht", revoked: "Widerrufen" } as const;
const statusTone = { active: "brand", expired: "neutral", used_up: "neutral", revoked: "neutral" } as const;

export function InvitesAdmin({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const list = useApi<InviteItem[]>(`/orgs/${slug}/invites`);
  const rows = list.data;
  const load = list.reload;
  const [created, setCreated] = useState<{ url: string; qr: string } | null>(null);
  const [maxUses, setMaxUses] = useState("50");
  const [days, setDays] = useState("14");
  const [creating, runCreate] = useBusy();

  useEffect(() => setCreated(null), [slug]);

  function create(e: FormEvent) {
    e.preventDefault();
    void runCreate(async () => {
      onError(null);
      try {
        const inv = await api<CreatedInvite>(`/orgs/${slug}/invites`, { method: "POST", body: { maxUses: Number(maxUses), expiresInDays: Number(days) } });
        const url = `${window.location.origin}/einladung/${inv.token}`;
        const QRCode = (await import("qrcode")).default;
        setCreated({ url, qr: await QRCode.toDataURL(url, { margin: 2, width: 360, errorCorrectionLevel: "M" }) });
        load();
      } catch (err) {
        onError(describeError(err));
      }
    });
  }

  async function revoke(id: string) {
    if (!(await ask("Einladungslink widerrufen? Er funktioniert danach nicht mehr.", { confirmLabel: "Widerrufen" }))) return;
    onError(null);
    try {
      await api(`/orgs/${slug}/invites/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      onError(describeError(err));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <p className="mb-3 text-sm text-muted">
          Mit einem Einladungslink treten Personen direkt als Mitglied bei – ohne einzelne Freigabe. Teile ihn nur mit den Menschen, die dazugehören (z. B. per Messenger oder Aushang). Der Link wird nur einmal angezeigt.
        </p>
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <Field id="inv-max" label="Max. Beitritte" type="number" min={1} max={500} required value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="w-32" />
          <Field id="inv-days" label="Gültig (Tage)" type="number" min={1} max={90} required value={days} onChange={(e) => setDays(e.target.value)} className="w-32" />
          <Button type="submit" busy={creating}>Link erstellen</Button>
        </form>
        {created && (
          <div className="mt-4 space-y-2">
            <Alert tone="success">Neuer Link – kopiere ihn jetzt, er wird nicht noch einmal angezeigt.</Alert>
            <CopyField label="Einladungslink" value={created.url} />
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={created.qr} alt="QR-Code des Einladungslinks" width={140} height={140} className="rounded bg-white" />
              <div className="space-y-2 text-sm">
                <p className="text-muted">Für den Aushang im Vereinsheim: ausdrucken oder als Bild speichern. Wer den QR-Code scannt, landet direkt bei der Einladung.</p>
                <LinkButton native size="sm" variant="secondary" href={created.qr} download="einladung-qr.png" onClick={() => toast.success("QR-Code gespeichert")}>
                  QR-Code als Bild speichern
                </LinkButton>
              </div>
            </div>
          </div>
        )}
      </Card>

      {list.error && !rows ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : rows === null ? (
        <CardSkeletons count={2} />
      ) : rows.length === 0 ? (
        <EmptyState title="Noch keine Einladungen." />
      ) : (
        <Card flush className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
              <span>{r.uses} von {r.maxUses} Beitritten</span>
              <span className="text-xs text-muted">bis {new Date(r.expiresAt).toLocaleDateString("de-DE")}</span>
              {r.status === "active" && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => revoke(r.id)}>Widerrufen</Button>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export function BillingProfileAdmin({ slug, canEdit, onError }: { slug: string; canEdit: boolean; onError: (m: string | null) => void }) {
  const profile = useApi<OrgBillingProfile>(`/orgs/${slug}/billing-profile`);
  const form = profile.data;
  const setForm = profile.setData;
  const [saved, setSaved] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    onError(null);
    setSaved(false);
    try {
      setForm(await api<OrgBillingProfile>(`/orgs/${slug}/billing-profile`, { method: "PUT", body: form }));
      setSaved(true);
    } catch (err) {
      onError(describeError(err));
    }
  }

  if (profile.error && !form) return <ErrorState message={profile.error} onRetry={profile.reload} />;
  if (!form) return <CardSkeletons count={2} />;
  return (
    <Card>
      <p className="mb-3 text-sm text-muted">Diese Angaben erscheinen auf Rechnungen. Bereits finalisierte Rechnungen bleiben unverändert.</p>
      <form onSubmit={save} className="max-w-lg space-y-4">
        <TextareaField id="bp-address" label="Anschrift des Vereins" rows={3} maxLength={300} disabled={!canEdit} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <Field id="bp-iban" label="IBAN für Überweisungen" disabled={!canEdit} value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} hint="Wird auf der Rechnung mit der Rechnungsnummer als Verwendungszweck angezeigt." />
        <TextareaField id="bp-tax" label="Steuerhinweis" rows={2} maxLength={300} disabled={!canEdit} value={form.taxInfo} onChange={(e) => setForm({ ...form, taxInfo: e.target.value })} placeholder="z. B. Steuernummer oder Freistellungsbescheid vom …" />
        {canEdit ? <Button type="submit">Speichern</Button> : <p className="text-xs text-muted">Nur der Vorstand kann die Stammdaten ändern.</p>}
        {saved && <Alert tone="success">Gespeichert.</Alert>}
      </form>
    </Card>
  );
}
