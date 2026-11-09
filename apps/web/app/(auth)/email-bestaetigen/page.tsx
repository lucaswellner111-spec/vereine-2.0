"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ConfirmEmailResult } from "@vereine/shared";
import { Alert, CardSkeletons } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { takeHashToken, takeRememberedNext } from "@/lib/next-url";

/**
 * Ziel des Links aus der Bestaetigungs- bzw. Adresswechsel-Mail (/email-bestaetigen#t=…). Der Token steht im Fragment,
 * damit er nicht in Server-Logs landet. Frische Registrierung: danach angemeldet und weiter zum gemerkten Ziel.
 */
export default function ConfirmEmailPage() {
  const { setUser, user, refresh } = useAuth();
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<{ kind: "busy" } | { kind: "error"; message: string } | { kind: "done"; changed: boolean; loggedIn: boolean }>({ kind: "busy" });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = takeHashToken();
    if (!token) {
      setState({ kind: "error", message: "Der Link ist ungültig oder abgelaufen." });
      return;
    }
    api<ConfirmEmailResult>("/auth/email/confirm", { method: "POST", body: { token } })
      .then((res) => {
        if (res.loggedIn) {
          setUser(res.user);
          router.replace(takeRememberedNext("/feed"));
          return;
        }
        setState({ kind: "done", changed: res.changed, loggedIn: false });
        void refresh(); // angemeldet: Banner/Adresse aktualisieren
      })
      .catch((e) => setState({ kind: "error", message: describeError(e) }));
  }, [router, setUser, refresh]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">E-Mail-Adresse bestätigen</h1>
      {state.kind === "busy" && <CardSkeletons count={1} />}
      {state.kind === "error" && (
        <>
          <Alert>{state.message}</Alert>
          <p className="text-sm text-muted">
            Links aus unseren Mails gelten nur kurz und nur einmal. Registriere dich einfach erneut oder fordere in den Einstellungen einen neuen Link an.
          </p>
          <Link href="/login" className="block text-center text-sm font-medium text-brand hover:underline">Zur Anmeldung</Link>
        </>
      )}
      {state.kind === "done" && (
        <>
          <Alert tone="success">{state.changed ? "Deine neue E-Mail-Adresse ist bestätigt und gilt ab sofort." : "Deine E-Mail-Adresse ist bestätigt."}</Alert>
          <Link href={user ? "/feed" : "/login"} className="block text-center text-sm font-medium text-brand hover:underline">
            {user ? "Weiter zu Klubnest" : "Zur Anmeldung"}
          </Link>
        </>
      )}
    </div>
  );
}
