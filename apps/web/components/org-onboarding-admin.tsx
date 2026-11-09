"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, Share2 } from "lucide-react";
import type { CreatedInvite, InviteItem, InviteLink, OrgBillingProfile } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useApi, useBusy } from "@/lib/use-api";
import { ask, toast } from "./ui-hosts";
import { CopyField, Dialog } from "./ui-client";
import { Alert, Badge, Button, Card, CardSkeletons, EmptyState, ErrorState, Field, LinkButton, TextareaField } from "./ui";

const statusLabel = { active: "Aktiv", expired: "Abgelaufen", used_up: "Aufgebraucht", revoked: "Widerrufen" } as const;
const statusTone = { active: "brand", expired: "neutral", used_up: "neutral", revoked: "neutral" } as const;

/** QR-Code lokal im Browser erzeugen (Paket qrcode, keine Drittanbieter-Requests). */
async function qrDataUrl(url: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(url, { margin: 2, width: 360, errorCorrectionLevel: "M" });
}

const inviteUrl = (token: string) => `${window.location.origin}/einladung/${token}`;

/** Link, QR-Code, Teilen und QR speichern – nach dem Erstellen und beim erneuten Anzeigen. */
function InviteLinkPanel({ url, qr }: { url: string; qr: string }) {
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  async function share() {
    try {
      await navigator.share({ title: "Einladung", text: "Tritt unserem Verein bei:", url });
    } catch (err) {
      // Abbrechen durch die Person ist kein Fehler
      if ((err as { name?: string })?.name !== "AbortError") toast.error("Teilen hat nicht geklappt. Kopiere den Link stattdessen.");
    }
  }

  return (
    <div className="space-y-2">
      <CopyField label="Einladungslink" value={url} />
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR-Code des Einladungslinks" width={140} height={140} className="rounded bg-white" />
        <div className="space-y-2 text-sm">
          <p className="text-muted">Für den Aushang im Vereinsheim: ausdrucken oder als Bild speichern. Wer den QR-Code scannt, landet direkt bei der Einladung.</p>
          <div className="flex flex-wrap gap-2">
            {canShare && (
              <Button size="sm" variant="secondary" onClick={() => void share()}>
                <Share2 size={14} aria-hidden />
                Teilen
              </Button>
            )}
            <LinkButton native size="sm" variant="secondary" href={qr} download="einladung-qr.png" onClick={() => toast.success("QR-Code gespeichert")}>
              QR-Code als Bild speichern
            </LinkButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Link einer aktiven Einladung per Mail verschicken (Adresse wird nicht gespeichert; max. 100 Mails je Verein und Tag). */
function InviteMailForm({ slug, inviteId }: { slug: string; inviteId: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();

  function send(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      setError(null);
      try {
        await api(`/orgs/${slug}/invites/${inviteId}/mail`, { method: "POST", body: { email } });
        toast.success(`Einladung an ${email.trim()} verschickt.`);
        setEmail("");
      } catch (err) {
        setError(describeError(err));
      }
    });
  }

  return (
    <form onSubmit={send} className="space-y-2 rounded-lg border border-border p-3">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap items-end gap-2">
        <Field id={`inv-mail-${inviteId}`} label="Per E-Mail einladen" type="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-0 flex-1" />
        <Button type="submit" variant="secondary" busy={busy} disabled={!email}>Senden</Button>
      </div>
      <p className="text-xs text-muted">Wir speichern die Adresse nicht. Die Mail enthält den Link und einen Abmeldelink; wer sich abmeldet, bekommt keine Einladungen mehr.</p>
    </form>
  );
}

type Shown = { invite: InviteItem; link: { url: string; qr: string } | null; error: string | null };

export function InvitesAdmin({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const list = useApi<InviteItem[]>(`/orgs/${slug}/invites`);
  const rows = list.data;
  const load = list.reload;
  const [created, setCreated] = useState<{ id: string; url: string; qr: string } | null>(null);
  const [maxUses, setMaxUses] = useState("50");
  const [days, setDays] = useState("14");
  const [creating, runCreate] = useBusy();
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    setCreated(null);
    setShown(null);
  }, [slug]);

  async function show(invite: InviteItem) {
    setShown({ invite, link: null, error: null });
    if (!invite.linkAvailable) return;
    try {
      const { token } = await api<InviteLink>(`/orgs/${slug}/invites/${invite.id}/link`);
      const url = inviteUrl(token);
      const qr = await qrDataUrl(url);
      setShown((s) => (s?.invite.id === invite.id ? { invite, link: { url, qr }, error: null } : s));
    } catch (err) {
      setShown((s) => (s?.invite.id === invite.id ? { invite, link: null, error: describeError(err) } : s));
    }
  }

  function create(e: FormEvent) {
    e.preventDefault();
    void runCreate(async () => {
      onError(null);
      try {
        const inv = await api<CreatedInvite>(`/orgs/${slug}/invites`, { method: "POST", body: { maxUses: Number(maxUses), expiresInDays: Number(days) } });
        const url = inviteUrl(inv.token);
        setCreated({ id: inv.id, url, qr: await qrDataUrl(url) });
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
          Mit einem Einladungslink treten Personen direkt als Mitglied bei – ohne einzelne Freigabe. Teile ihn nur mit den Menschen, die dazugehören (z. B. per Messenger oder Aushang). Aktive Links kannst du in der Liste unten jederzeit erneut öffnen.
        </p>
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <Field id="inv-max" label="Max. Beitritte" type="number" min={1} max={500} required value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="w-32" />
          <Field id="inv-days" label="Gültig (Tage)" type="number" min={1} max={90} required value={days} onChange={(e) => setDays(e.target.value)} className="w-32" />
          <Button type="submit" busy={creating}>Link erstellen</Button>
        </form>
        {created && (
          <div className="mt-4 space-y-2">
            <Alert tone="success">Neuer Link erstellt. Du findest ihn auch später in der Liste unten.</Alert>
            <InviteLinkPanel url={created.url} qr={created.qr} />
            <InviteMailForm slug={slug} inviteId={created.id} />
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
              {r.status === "active" ? (
                <button
                  type="button"
                  onClick={() => void show(r)}
                  className="-m-1 flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-3 rounded-lg p-1 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
                  <span>{r.uses} von {r.maxUses} Beitritten</span>
                  <span className="text-xs text-muted">bis {new Date(r.expiresAt).toLocaleDateString("de-DE")}</span>
                  <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand">
                    Link anzeigen
                    <ChevronRight size={14} aria-hidden />
                  </span>
                </button>
              ) : (
                <>
                  <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
                  <span>{r.uses} von {r.maxUses} Beitritten</span>
                  <span className="text-xs text-muted">bis {new Date(r.expiresAt).toLocaleDateString("de-DE")}</span>
                </>
              )}
              {r.status === "active" && <Button size="sm" variant="ghost" onClick={() => revoke(r.id)}>Widerrufen</Button>}
            </div>
          ))}
        </Card>
      )}

      <Dialog
        open={!!shown}
        onClose={() => setShown(null)}
        title="Einladungslink"
        placement="sheet"
        description={shown ? `${shown.invite.uses} von ${shown.invite.maxUses} Beitritten, gültig bis ${new Date(shown.invite.expiresAt).toLocaleDateString("de-DE")}.` : undefined}
      >
        {shown &&
          (!shown.invite.linkAvailable ? (
            <Alert tone="info">Dieser Link wurde vor der Umstellung erstellt und kann nicht erneut angezeigt werden. Bitte neu erstellen und den alten Link widerrufen.</Alert>
          ) : shown.error ? (
            <Alert>{shown.error}</Alert>
          ) : shown.link ? (
            <div className="space-y-3">
              <InviteLinkPanel url={shown.link.url} qr={shown.link.qr} />
              <InviteMailForm slug={slug} inviteId={shown.invite.id} />
            </div>
          ) : (
            <CardSkeletons count={1} />
          ))}
      </Dialog>
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
