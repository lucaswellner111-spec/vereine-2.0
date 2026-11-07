"use client";

import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";
import { Dialog } from "./ui-client";

/*
 * Bestaetigungsdialog (ask) und Rueckmeldungen (toast) als einfache, global aufrufbare Funktionen.
 * Die Host-Komponente <UiHosts /> steht einmal im Root-Layout. Ersetzt window.confirm():
 * gleiche Gestaltung in allen Browsern, Tastatur (Esc/Enter) und Screenreader-tauglich.
 */

type AskOptions = { confirmLabel?: string; cancelLabel?: string; danger?: boolean; title?: string };
type Pending = { message: string; opts: AskOptions; resolve: (ok: boolean) => void };
type ToastAction = { label: string; onClick: () => void };
type ToastOptions = { action?: ToastAction };
type ToastItem = { id: number; tone: "success" | "error" | "info"; message: string; action?: ToastAction };

let askListener: ((p: Pending) => void) | null = null;
let toastListener: ((t: ToastItem) => void) | null = null;
let toastId = 0;

/** Fragt nach Bestaetigung; liefert true bei "OK". Ohne eingebundenen Host: Fallback auf window.confirm. */
export function ask(message: string, opts: AskOptions = {}): Promise<boolean> {
  if (!askListener) return Promise.resolve(typeof window !== "undefined" ? window.confirm(message) : false);
  return new Promise((resolve) => askListener!({ message, opts, resolve }));
}

/** Rueckmeldung; mit action (z. B. "Neu laden") bleibt der Hinweis stehen, bis er bedient oder geschlossen wird. */
export const toast = {
  success: (message: string, opts: ToastOptions = {}) => toastListener?.({ id: ++toastId, tone: "success", message, ...opts }),
  error: (message: string, opts: ToastOptions = {}) => toastListener?.({ id: ++toastId, tone: "error", message, ...opts }),
  info: (message: string, opts: ToastOptions = {}) => toastListener?.({ id: ++toastId, tone: "info", message, ...opts }),
};

const icons = { success: CheckCircle2, error: AlertTriangle, info: Info } as const;

export function UiHosts() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    askListener = (p) => {
      // Laeuft schon eine Frage, wird sie als "Abbrechen" beendet
      setPending((old) => {
        old?.resolve(false);
        return p;
      });
    };
    toastListener = (t) => {
      setToasts((l) => [...l.slice(-3), t]);
      if (!t.action) setTimeout(() => setToasts((l) => l.filter((x) => x.id !== t.id)), t.tone === "error" ? 7000 : 4000);
    };
    return () => {
      askListener = null;
      toastListener = null;
    };
  }, []);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <>
      <Dialog
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.opts.title ?? "Bitte bestätigen"}
        description={pending?.message}
        role="alertdialog"
        placement="sheet"
        size="sm"
        initialFocusRef={confirmRef}
        footer={
          pending && (
            <>
              <Button variant="secondary" onClick={() => close(false)}>
                {pending.opts.cancelLabel ?? "Abbrechen"}
              </Button>
              <Button ref={confirmRef} variant={pending.opts.danger === false ? "primary" : "danger"} onClick={() => close(true)}>
                {pending.opts.confirmLabel ?? "Bestätigen"}
              </Button>
            </>
          )
        }
      />

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6">
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className={clsx(
                "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border bg-surface px-3.5 py-2.5 text-sm shadow-overlay",
                t.tone === "success" && "border-brand/40",
                t.tone === "error" && "border-danger/50",
                t.tone === "info" && "border-border",
              )}
            >
              <Icon size={16} aria-hidden className={clsx("mt-0.5 shrink-0", t.tone === "success" && "text-brand", t.tone === "error" && "text-danger", t.tone === "info" && "text-muted")} />
              <p className="flex-1">{t.message}</p>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    setToasts((l) => l.filter((x) => x.id !== t.id));
                    t.action!.onClick();
                  }}
                  className="hit-area relative shrink-0 rounded font-medium text-brand hover:underline"
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" aria-label="Schließen" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))} className="hit-area relative -m-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:text-text"><X size={14} aria-hidden /></button>
            </div>
          );
        })}
      </div>
    </>
  );
}
