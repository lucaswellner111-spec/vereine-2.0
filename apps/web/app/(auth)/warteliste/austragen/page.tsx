"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { takeHashToken } from "@/lib/next-url";

/** Austragelink aus jeder Warteliste-Mail (/warteliste/austragen#t=…), ohne Login. Erst der Knopf loescht den Eintrag. */
export default function WaitlistRemovePage() {
  const tokenRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (tokenRef.current === null) tokenRef.current = takeHashToken();
    setToken(tokenRef.current);
  }, []);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api("/waitlist/remove", { method: "POST", body: { token } });
      setDone(true);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Von der Warteliste austragen</h1>
      {done ? (
        <Alert tone="success">Erledigt: Deine Angaben zur Warteliste sind gelöscht. Wir schreiben dir dazu nicht mehr.</Alert>
      ) : token === "" ? (
        <Alert>Dieser Link ist ungültig.</Alert>
      ) : (
        <>
          <p className="text-sm text-muted">Wir löschen deine E-Mail-Adresse und die Angaben zu deinem Verein sofort von der Warteliste.</p>
          {error && <Alert>{error}</Alert>}
          <Button variant="danger" onClick={remove} busy={busy} disabled={!token} className="w-full">Austragen und löschen</Button>
        </>
      )}
      <Link href="/" className="block text-center text-sm font-medium text-brand hover:underline">Zur Startseite</Link>
    </div>
  );
}
