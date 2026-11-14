"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { takeHashToken } from "@/lib/next-url";

/**
 * Abmeldelink aus Sammelmail und Einladungen (/abmelden#t=…), ohne Login. Erst der Knopf meldet ab: Link-Scanner in
 * Postfaechern oeffnen Links, druecken aber keine Knoepfe.
 */
export default function UnsubscribePage() {
  const tokenRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"digest" | "invite" | "waitlist" | null>(null);

  useEffect(() => {
    if (tokenRef.current === null) tokenRef.current = takeHashToken();
    setToken(tokenRef.current);
  }, []);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ kind: "digest" | "invite" | "waitlist" }>("/mail/unsubscribe", { method: "POST", body: { token } });
      setDone(res.kind);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">E-Mails abbestellen</h1>
      {done ? (
        <Alert tone="success">
          {done === "digest"
            ? "Erledigt: Du bekommst keine Sammelmail mehr. In den Einstellungen unter „Mitteilungen“ kannst du sie wieder einschalten."
            : done === "waitlist"
              ? "Erledigt: Du bist von der Warteliste ausgetragen, deine Angaben sind gelöscht. Wir schreiben dir dazu nicht mehr."
              : "Erledigt: An diese Adresse schicken wir keine Einladungen mehr."}
        </Alert>
      ) : token === "" ? (
        <Alert>Dieser Abmeldelink ist ungültig.</Alert>
      ) : (
        <>
          <p className="text-sm text-muted">Möchtest du diese Art von E-Mails nicht mehr bekommen? Wichtige Mails zu deinem Konto (z. B. Passwort zurücksetzen) bekommst du weiterhin.</p>
          {error && <Alert>{error}</Alert>}
          <Button onClick={confirm} busy={busy} disabled={!token} className="w-full">Abbestellen</Button>
        </>
      )}
      <Link href="/" className="block text-center text-sm font-medium text-brand hover:underline">Zur Startseite</Link>
    </div>
  );
}
