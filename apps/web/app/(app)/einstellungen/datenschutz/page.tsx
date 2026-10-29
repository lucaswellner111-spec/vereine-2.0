"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ConsentState } from "@vereine/shared";
import { Alert, Button, Card, Field, PageHeader, Toggle } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const labels: Record<string, { title: string; text: string; locked?: boolean }> = {
  terms: { title: "Nutzungsbedingungen", text: "Voraussetzung für die Nutzung.", locked: true },
  privacy: { title: "Datenschutzerklärung", text: "Zur Kenntnis genommen.", locked: true },
  personalized_feed: { title: "Personalisierter Feed", text: "Beiträge werden anhand deiner Interaktionen sortiert. Ohne Einwilligung siehst du den chronologischen Feed." },
  analytics: { title: "Anonyme Nutzungsstatistik", text: "Hilft uns, die Plattform zu verbessern. Keine Weitergabe an Dritte." },
  marketing_email: { title: "Neuigkeiten per E-Mail", text: "Gelegentliche Produktneuigkeiten." },
};

export default function PrivacyPage() {
  const { user, clear } = useAuth();
  const router = useRouter();
  const [consents, setConsents] = useState<ConsentState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<ConsentState[]>("/privacy/consents").then(setConsents).catch((e) => setError(describeError(e)));
  }, []);
  useEffect(load, [load]);

  async function toggle(purpose: ConsentState["purpose"], granted: boolean) {
    setError(null);
    try {
      setConsents(await api<ConsentState[]>("/privacy/consents", { method: "PUT", body: { purpose, granted } }));
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
      setNotice("Deine Daten wurden heruntergeladen.");
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
      setDeleteError(describeError(e));
    }
  }

  return (
    <>
      <PageHeader title="Datenschutz" subtitle={`Deine Einstellungen und Rechte, ${user?.displayName ?? ""}.`} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}

      <h2 className="mb-2 font-semibold">Einwilligungen</h2>
      <Card className="mb-6 divide-y divide-border p-0">
        {consents.map((c) => {
          const meta = labels[c.purpose];
          return (
            <div key={c.purpose} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium">{meta.title}</p>
                <p className="text-xs text-muted">{meta.text}</p>
              </div>
              <Toggle label={meta.title} checked={c.granted} disabled={meta.locked} onChange={(v) => toggle(c.purpose, v)} />
            </div>
          );
        })}
      </Card>

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
