"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { TwoFactorSetup, TwoFactorStatus } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { Alert, Badge, Button, Card, Field } from "./ui";

type Mode = "idle" | "setup" | "codes" | "manage";

export function TwoFactorCard({ onError }: { onError: (m: string | null) => void }) {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<TwoFactorStatus>("/auth/2fa").then(setStatus).catch((e) => onError(describeError(e)));
  }, [onError]);
  useEffect(load, [load]);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    onError(null);
    try {
      await fn();
    } catch (e) {
      onError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const reset = () => {
    setMode("idle");
    setCode("");
    setPassword("");
    setSetup(null);
  };

  const start = () =>
    act(async () => {
      setSetup(await api<TwoFactorSetup>("/auth/2fa/setup", { method: "POST" }));
      setMode("setup");
    });

  const enable = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      const res = await api<{ recoveryCodes: string[] }>("/auth/2fa/enable", { method: "POST", body: { code } });
      setCodes(res.recoveryCodes);
      reset();
      setMode("codes");
      load();
    });
  };

  const disable = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      await api("/auth/2fa/disable", { method: "POST", body: { password, code } });
      reset();
      load();
    });
  };

  const regenerate = () =>
    act(async () => {
      const res = await api<{ recoveryCodes: string[] }>("/auth/2fa/recovery-codes", { method: "POST", body: { password, code } });
      setCodes(res.recoveryCodes);
      reset();
      setMode("codes");
      load();
    });

  return (
    <>
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        Zwei-Faktor-Anmeldung {status && <Badge tone={status.enabled ? "brand" : "neutral"}>{status.enabled ? "Aktiv" : "Aus"}</Badge>}
      </h2>
      <Card className="mb-6 space-y-4">
        <p className="text-sm text-muted">
          Zusätzlich zum Passwort braucht die Anmeldung einen Code aus einer Authenticator-App (z. B. Aegis, 2FAS, Google Authenticator). Das schützt dein Konto, auch wenn dein Passwort bekannt wird. Empfohlen für Vorstände und Kassenwarte.
        </p>

        {status === null ? (
          <p className="text-sm text-muted" role="status">Lade …</p>
        ) : mode === "codes" && codes ? (
          <div className="space-y-3">
            <Alert tone="success">Notfallcodes – jetzt sicher aufbewahren (z. B. Passwortmanager oder Ausdruck). Jeder Code funktioniert einmal und wird nicht noch einmal angezeigt.</Alert>
            <ul className="grid max-w-sm grid-cols-2 gap-2 font-mono text-sm">
              {codes.map((c) => (
                <li key={c} className="rounded-lg bg-surface-2 px-3 py-1.5">{c}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(codes.join("\n")).catch(() => onError("Kopieren nicht möglich."))}>Kopieren</Button>
              <Button onClick={() => { setCodes(null); setMode("idle"); }}>Ich habe sie gesichert</Button>
            </div>
          </div>
        ) : mode === "setup" && setup ? (
          <form onSubmit={enable} className="max-w-sm space-y-3">
            <p className="text-sm">1. Scanne den QR-Code mit deiner Authenticator-App oder gib den Schlüssel von Hand ein.</p>
            <div className="inline-block rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
            <p className="break-all font-mono text-xs text-muted">{setup.secret}</p>
            <Field id="tf-code" label="2. Code aus der App" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>Aktivieren</Button>
              <Button type="button" variant="ghost" onClick={reset}>Abbrechen</Button>
            </div>
          </form>
        ) : status.enabled ? (
          mode === "manage" ? (
            <form onSubmit={disable} className="max-w-sm space-y-3">
              <Field id="tf-pw" label="Passwort" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <Field id="tf-code2" label="Code aus der App oder Notfallcode" required value={code} onChange={(e) => setCode(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="danger" disabled={busy}>Zwei-Faktor ausschalten</Button>
                <Button type="button" variant="secondary" disabled={busy || !password || !code} onClick={regenerate}>Neue Notfallcodes</Button>
                <Button type="button" variant="ghost" onClick={reset}>Abbrechen</Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted">{status.recoveryCodesLeft} Notfallcodes übrig</span>
              <Button variant="secondary" onClick={() => setMode("manage")}>Verwalten</Button>
            </div>
          )
        ) : (
          <Button onClick={start} disabled={busy}>Einrichten</Button>
        )}
      </Card>
    </>
  );
}
