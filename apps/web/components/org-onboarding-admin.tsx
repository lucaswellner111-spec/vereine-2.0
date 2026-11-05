"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CreatedInvite, InviteItem, OrgBillingProfile } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { toast } from "./ui-hosts";
import { Alert, Badge, Button, Card, Field, CardSkeletons } from "./ui";

const statusLabel = { active: "Aktiv", expired: "Abgelaufen", used_up: "Aufgebraucht", revoked: "Widerrufen" } as const;
const statusTone = { active: "brand", expired: "neutral", used_up: "neutral", revoked: "neutral" } as const;

export function InvitesAdmin({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const [rows, setRows] = useState<InviteItem[] | null>(null);
  const [created, setCreated] = useState<{ url: string; qr: string } | null>(null);
  const [maxUses, setMaxUses] = useState("50");
  const [days, setDays] = useState("14");
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api<InviteItem[]>(`/orgs/${slug}/invites`).then(setRows).catch((e) => onError(describeError(e)));
  }, [slug, onError]);
  useEffect(() => {
    setRows(null);
    setCreated(null);
    load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const inv = await api<CreatedInvite>(`/orgs/${slug}/invites`, { method: "POST", body: { maxUses: Number(maxUses), expiresInDays: Number(days) } });
      const url = `${window.location.origin}/einladung/${inv.token}`;
      const QRCode = (await import("qrcode")).default;
      setCreated({ url, qr: await QRCode.toDataURL(url, { margin: 2, width: 360, errorCorrectionLevel: "M" }) });
      setCopied(false);
      load();
    } catch (err) {
      onError(describeError(err));
    }
  }

  async function revoke(id: string) {
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
          <div className="w-32"><Field id="inv-max" label="Max. Beitritte" type="number" min={1} max={500} required value={maxUses} onChange={(e) => setMaxUses(e.target.value)} /></div>
          <div className="w-32"><Field id="inv-days" label="Gültig (Tage)" type="number" min={1} max={90} required value={days} onChange={(e) => setDays(e.target.value)} /></div>
          <Button type="submit">Link erstellen</Button>
        </form>
        {created && (
          <div className="mt-4 space-y-2">
            <Alert tone="success">Neuer Link – kopiere ihn jetzt, er wird nicht noch einmal angezeigt.</Alert>
            <div className="flex flex-wrap items-center gap-2">
              <input readOnly aria-label="Einladungslink" value={created.url} onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 font-mono text-xs" />
              <Button
                variant="secondary"
                onClick={() =>
                  navigator.clipboard.writeText(created.url).then(
                    () => setCopied(true),
                    () => onError("Kopieren nicht möglich – markiere den Link und kopiere ihn von Hand."),
                  )
                }
              >
                {copied ? "Kopiert ✓" : "Kopieren"}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={created.qr} alt="QR-Code des Einladungslinks" width={140} height={140} className="rounded bg-white" />
              <div className="space-y-2 text-sm">
                <p className="text-muted">Für den Aushang im Vereinsheim: ausdrucken oder als Bild speichern. Wer den QR-Code scannt, landet direkt bei der Einladung.</p>
                <a href={created.qr} download="einladung-qr.png" onClick={() => toast.success("QR-Code gespeichert")} className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-2">
                  QR-Code als Bild speichern
                </a>
              </div>
            </div>
          </div>
        )}
      </Card>

      {rows === null ? (
        <CardSkeletons count={2} />
      ) : rows.length === 0 ? (
        <Card><p className="text-sm text-muted">Noch keine Einladungen.</p></Card>
      ) : (
        <Card className="divide-y divide-border p-0">
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
  const [form, setForm] = useState<OrgBillingProfile | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(null);
    api<OrgBillingProfile>(`/orgs/${slug}/billing-profile`).then(setForm).catch((e) => onError(describeError(e)));
  }, [slug, onError]);

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

  if (!form) return <CardSkeletons count={2} />;
  return (
    <Card>
      <p className="mb-3 text-sm text-muted">Diese Angaben erscheinen auf Rechnungen. Bereits finalisierte Rechnungen bleiben unverändert.</p>
      <form onSubmit={save} className="max-w-lg space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="bp-address" className="text-sm font-medium">Anschrift des Vereins</label>
          <textarea id="bp-address" rows={3} maxLength={300} disabled={!canEdit} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full resize-none rounded-lg border border-border bg-bg p-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60" />
        </div>
        <Field id="bp-iban" label="IBAN für Überweisungen" disabled={!canEdit} value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} hint="Wird auf der Rechnung mit der Rechnungsnummer als Verwendungszweck angezeigt." />
        <div className="space-y-1.5">
          <label htmlFor="bp-tax" className="text-sm font-medium">Steuerhinweis</label>
          <textarea id="bp-tax" rows={2} maxLength={300} disabled={!canEdit} value={form.taxInfo} onChange={(e) => setForm({ ...form, taxInfo: e.target.value })} placeholder="z. B. Steuernummer oder Freistellungsbescheid vom …" className="w-full resize-none rounded-lg border border-border bg-bg p-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60" />
        </div>
        {canEdit ? <Button type="submit">Speichern</Button> : <p className="text-xs text-muted">Nur der Vorstand kann die Stammdaten ändern.</p>}
        {saved && <Alert tone="success">Gespeichert.</Alert>}
      </form>
    </Card>
  );
}
