"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConsentState } from "@vereine/shared";
import { BlockedPeopleCard } from "@/components/blocked-people-card";
import { SettingsBackLink } from "@/components/settings-back-link";
import { Alert, Button, Card, ErrorState, Field, ListSkeleton, PageHeader, Toggle } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { toast } from "@/components/ui-hosts";

const labels: Record<string, { title: string; text: string; locked?: boolean }> = {
  terms: { title: "Nutzungsbedingungen", text: "Voraussetzung für die Nutzung.", locked: true },
  privacy: { title: "Datenschutzerklärung", text: "Zur Kenntnis genommen.", locked: true },
  personalized_feed: { title: "Personalisierter Feed", text: "Beiträge werden anhand deiner Interaktionen sortiert. Ohne Einwilligung siehst du den chronologischen Feed." },
  analytics: { title: "Anonyme Nutzungsstatistik", text: "Hilft uns, die Plattform zu verbessern. Keine Weitergabe an Dritte." },
  marketing_email: { title: "Neuigkeiten per E-Mail", text: "Gelegentliche Produktneuigkeiten." },
};
/** Immer sichtbar. Statistik und E-Mail-Neuigkeiten werden derzeit nicht genutzt und erscheinen nur,
 *  wenn sie erteilt sind – damit man sie widerrufen kann (Art. 7 Abs. 3 DSGVO). */
const VISIBLE = new Set(["terms", "privacy", "personalized_feed"]);
const UNUSED_TEXT = "Wird derzeit nicht genutzt. Du kannst die Einwilligung widerrufen.";

export default function PrivacyPage() {
  const { user, clear } = useAuth();
  const router = useRouter();
  const consentList = useApi<ConsentState[]>("/privacy/consents");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function toggle(purpose: ConsentState["purpose"], granted: boolean) {
    setError(null);
    try {
      consentList.setData(await api<ConsentState[]>("/privacy/consents", { method: "PUT", body: { purpose, granted } }));
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function download() {
    setError(null);
    try {
      const data = await api<unknown>("/privacy/export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: "meine-daten.json" });
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Deine Daten wurden heruntergeladen.");
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function deleteAccount() {
    setDeleteError(null);
    try {
      await api("/privacy/account", { method: "DELETE", body: { password } });
      router.replace("/login?geloescht=1");
      clear();
    } catch (e) {
      // 409: du bist einziger Vorstand eines Vereins mit weiteren Mitgliedern - der Servertext nennt die Vereine.
      setDeleteError(describeError(e));
    }
  }

  return (
    <>
      <SettingsBackLink />
      <PageHeader title="Datenschutz" subtitle={`Deine Einstellungen und Rechte, ${user?.displayName ?? ""}.`} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <h2 className="mb-2 font-semibold">Einwilligungen</h2>
      {consentList.error && !consentList.data ? (
        <ErrorState message={consentList.error} onRetry={consentList.reload} className="mb-6" />
      ) : !consentList.data ? (
        <ListSkeleton rows={3} className="mb-6" />
      ) : (
        <Card flush className="mb-6 divide-y divide-border">
          {consentList.data
            .filter((c) => labels[c.purpose] && (VISIBLE.has(c.purpose) || c.granted))
            .map((c) => {
              const meta = labels[c.purpose];
              return (
                <div key={c.purpose} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-medium">{meta.title}</p>
                    <p className="text-xs text-muted">{VISIBLE.has(c.purpose) ? meta.text : UNUSED_TEXT}</p>
                  </div>
                  <Toggle label={meta.title} checked={c.granted} disabled={meta.locked} onChange={(v) => toggle(c.purpose, v)} />
                </div>
              );
            })}
        </Card>
      )}

      <BlockedPeopleCard />

      <h2 className="mb-2 font-semibold">Deine Daten</h2>
      <Card className="mb-6">
        <p className="text-sm text-muted">Lade alle über dich gespeicherten Daten als JSON-Datei herunter (Art. 15 und 20 DSGVO).</p>
        <Button variant="secondary" className="mt-3" onClick={download}>Daten herunterladen</Button>
      </Card>

      <h2 className="mb-2 font-semibold text-danger">Konto löschen</h2>
      <Card className="border-danger/40">
        <p className="text-sm text-muted">
          Dein Konto, deine Sitzungen und Einwilligungen werden unwiderruflich gelöscht (Art. 17 DSGVO).
        </p>
        <p className="mt-2 text-sm text-muted">
          Bist du einziger Vorstand eines Vereins, übertrage vorher die Vorstandsrolle (Verwaltung → Mitglieder).
          Vereine ohne weitere Mitglieder werden gelöscht; exportiere vorher die Rechnungen (CSV).
        </p>
        {confirmDelete ? (
          <div className="mt-3 max-w-sm space-y-3">
            {deleteError && <Alert>{deleteError}</Alert>}
            <Field id="del-pw" label="Passwort zur Bestätigung" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="danger" disabled={!password} onClick={deleteAccount}>Endgültig löschen</Button>
              <Button variant="ghost" onClick={() => { setConfirmDelete(false); setPassword(""); }}>Abbrechen</Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" className="mt-3" onClick={() => setConfirmDelete(true)}>Konto löschen …</Button>
        )}
      </Card>
    </>
  );
}
