"use client";

import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

/*
 * Bestaetigungsdialog (ask) und Rueckmeldungen (toast) als einfache, global aufrufbare Funktionen.
 * Die Host-Komponente <UiHosts /> steht einmal im Root-Layout. Ersetzt window.confirm():
 * gleiche Gestaltung in allen Browsern, Tastatur (Esc/Enter) und Screenreader-tauglich.
 */

type AskOptions = { confirmLabel?: string; cancelLabel?: string; danger?: boolean; title?: string };
type Pending = { message: string; opts: AskOptions; resolve: (ok: boolean) => void };
type ToastItem = { id: number; tone: "success" | "error" | "info"; message: string };

let askListener: ((p: Pending) => void) | null = null;
let toastListener: ((t: ToastItem) => void) | null = null;
let toastId = 0;

/** Fragt nach Bestaetigung; liefert true bei "OK". Ohne eingebundenen Host: Fallback auf window.confirm. */
export function ask(message: string, opts: AskOptions = {}): Promise<boolean> {
  if (!askListener) return Promise.resolve(typeof window !== "undefined" ? window.confirm(message) : false);
  return new Promise((resolve) => askListener!({ message, opts, resolve }));
}

export const toast = {
  success: (message: string) => toastListener?.({ id: ++toastId, tone: "success", message }),
  error: (message: string) => toastListener?.({ id: ++toastId, tone: "error", message }),
  info: (message: string) => toastListener?.({ id: ++toastId, tone: "info", message }),
};

const icons = { success: CheckCircle2, error: AlertTriangle, info: Info } as const;

export function UiHosts() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    askListener = (p) => {
      lastFocus.current = document.activeElement as HTMLElement | null;
      setPending(p);
    };
    toastListener = (t) => {
      setToasts((l) => [...l.slice(-3), t]);
      setTimeout(() => setToasts((l) => l.filter((x) => x.id !== t.id)), t.tone === "error" ? 7000 : 4000);
    };
    return () => {
      askListener = null;
      toastListener = null;
    };
  }, []);

  useEffect(() => {
    if (pending) confirmRef.current?.focus();
  }, [pending]);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
    lastFocus.current?.focus?.();
  };

  return (
    <>
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onMouseDown={(e) => e.target === e.currentTarget && close(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close(false);
            if (e.key === "Tab") {
              // Fokus im Dialog halten (zwei Knoepfe)
              const btns = Array.from(e.currentTarget.querySelectorAll("button"));
              const first = btns[0];
              const last = btns[btns.length - 1];
              if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
              else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
            }
          }}
        >
          <div role="alertdialog" aria-modal="true" aria-labelledby="ask-title" aria-describedby="ask-text" className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-overlay">
            <h2 id="ask-title" className="text-base font-semibold">{pending.opts.title ?? "Bitte bestätigen"}</h2>
            <p id="ask-text" className="mt-2 text-sm text-muted">{pending.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => close(false)}>{pending.opts.cancelLabel ?? "Abbrechen"}</Button>
              <Button ref={confirmRef} variant={pending.opts.danger === false ? "primary" : "danger"} onClick={() => close(true)}>
                {pending.opts.confirmLabel ?? "Bestätigen"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6">
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
              <button type="button" aria-label="Schließen" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))} className="text-muted hover:text-text"><X size={14} aria-hidden /></button>
            </div>
          );
        })}
      </div>
    </>
  );
}
