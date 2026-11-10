"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { takeHashToken } from "@/lib/next-url";

/**
 * Ziel des Links aus der Warteliste-Mail (/warteliste/bestaetigen#t=…), ohne Login. Der Token steht im Fragment (nicht in
 * Server-Logs). Erst der Knopf bestaetigt: Link-Scanner in Postfaechern oeffnen Links, druecken aber keine Knoepfe.
 */
export default function WaitlistConfirmPage() {
  const tokenRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (tokenRef.current === null) tokenRef.current = takeHashToken();
    setToken(tokenRef.current);
  }, []);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api("/waitlist/confirm", { method: "POST", body: { token } });
      setDone(true);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Warteliste bestätigen</h1>
      {done ? (
        <>
          <Alert tone="success">Danke, du stehst auf der Warteliste! Wir melden uns, sobald Klubnest für deinen Verein startet.</Alert>
          <p className="text-sm text-muted">Austragen kannst du dich jederzeit über den Link in unseren Mails.</p>
        </>
      ) : token === "" ? (
        <Alert>Der Link ist ungültig oder abgelaufen. Melde dich auf der Startseite einfach erneut an.</Alert>
      ) : (
        <>
          <p className="text-sm text-muted">Fast geschafft: Bestätige mit einem Klick, dass wir dich zum Start informieren dürfen.</p>
          {error && <Alert>{error}</Alert>}
          <Button onClick={confirm} busy={busy} disabled={!token} className="w-full">Anmeldung bestätigen</Button>
        </>
      )}
      <Link href="/" className="block text-center text-sm font-medium text-brand hover:underline">Zur Startseite</Link>
    </div>
  );
}
