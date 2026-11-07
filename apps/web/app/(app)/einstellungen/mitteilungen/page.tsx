"use client";

import { useCallback, useEffect, useState } from "react";
import { PUSH_HOST_ERROR, type PrivatePushState } from "@vereine/shared";
import { SettingsBackLink } from "@/components/settings-back-link";
import { Alert, Badge, Button, Card, PageHeader, CardSkeletons } from "@/components/ui";
import { ApiError, api, describeError } from "@/lib/api";

function keyToBytes(base64Url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type Support = "checking" | "unsupported" | "denied" | "ready";

export default function NotificationSettingsPage() {
  const [state, setState] = useState<PrivatePushState | null>(null);
  const [support, setSupport] = useState<Support>("checking");
  const [active, setActive] = useState(false); // dieses Geraet ist angemeldet
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api<PrivatePushState>("/push"));
    } catch (e) {
      setError(describeError(e));
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setSupport("unsupported");
    if (Notification.permission === "denied") setSupport("denied");
    else setSupport("ready");
    const reg = await navigator.serviceWorker.getRegistration("/");
    setActive(!!(await reg?.pushManager.getSubscription()));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    if (!state?.publicKey) return;
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSupport(permission === "denied" ? "denied" : "ready");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(state.publicKey) as BufferSource });
      try {
        await api("/push/subscribe", { method: "POST", body: sub.toJSON() });
      } catch (e) {
        // Server lehnt unbekannte Push-Dienste ab (Schutz vor Anfragen an beliebige Server): Hinweis statt Fehler
        const unsupported = e instanceof ApiError && e.status === 400 && (e.message.includes(PUSH_HOST_ERROR) || JSON.stringify(e.fields ?? {}).includes(PUSH_HOST_ERROR));
        if (!unsupported) throw e;
        await sub.unsubscribe().catch(() => undefined);
        setHint("Der Push-Dienst dieses Browsers wird nicht unterstützt. Nutze einen aktuellen Chrome, Edge, Firefox oder Safari.");
      }
      await refresh();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api("/push/subscribe", { method: "DELETE", body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      await refresh();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingsBackLink />
      <PageHeader title="Mitteilungen" subtitle="Benachrichtigungen auf diesem Gerät, auch wenn Klubnest geschlossen ist." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {hint && <div className="mb-4"><Alert tone="info">{hint}</Alert></div>}
      <Card className="space-y-4">
        <p className="text-sm text-muted">
          Push-Mitteilungen informieren dich über neue Termine, Rechnungen, Folgeanfragen und mehr. Sie enthalten nur kurze Hinweise, keine Inhalte deiner Nachrichten. Du kannst sie jederzeit ausschalten; pro Konto bleiben höchstens 10 Geräte angemeldet (das älteste wird ersetzt). Für Push nutzt dein Browser den Dienst seines Herstellers als Zustellweg; die Nachricht selbst ist verschlüsselt.
        </p>
        {state === null || support === "checking" ? (
          <CardSkeletons count={2} />
        ) : !state.publicKey ? (
          <Alert tone="info">Push-Mitteilungen sind auf diesem Server noch nicht eingerichtet.</Alert>
        ) : support === "unsupported" ? (
          <Alert tone="info">Dieser Browser unterstützt keine Push-Mitteilungen. Auf dem iPhone: Klubnest zuerst „Zum Home-Bildschirm“ hinzufügen und die App von dort öffnen.</Alert>
        ) : support === "denied" ? (
          <Alert tone="info">Mitteilungen sind im Browser blockiert. Erlaube sie in den Website-Einstellungen und lade die Seite neu.</Alert>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={active ? "brand" : "neutral"}>{active ? "An diesem Gerät aktiv" : "An diesem Gerät aus"}</Badge>
            {active ? <Button variant="secondary" onClick={disable} busy={busy}>Ausschalten</Button> : <Button onClick={enable} busy={busy}>Mitteilungen aktivieren</Button>}
            <span className="text-xs text-muted">{state.devices} {state.devices === 1 ? "Gerät" : "Geräte"} insgesamt</span>
          </div>
        )}
      </Card>
    </>
  );
}
