"use client";

import clsx from "clsx";
import { Check, Copy, X, type LucideIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Button, Input } from "./ui";
import { toast } from "./ui-hosts";

/*
 * Interaktive Bausteine (mit Hooks): Modal-Logik, Dialog, Segment-/Tab-Leiste, Kopierfeld.
 */

// ---------- Scroll-Sperre mit Referenzzaehler (verschachtelte Modals) ----------

let lockCount = 0;
let savedOverflow = "";

/** Sperrt das Scrollen der Seite; die zurueckgegebene Funktion gibt die Sperre wieder frei (idempotent). */
export function lockScroll(): () => void {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount--;
    if (lockCount === 0) document.body.style.overflow = savedOverflow;
  };
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/**
 * Modal-Verhalten fuer einen Container: Fokus hinein und zurueck, Scroll-Sperre, Escape und Fokusfalle.
 * Das zurueckgegebene onKeyDown gehoert an den Container. Tasten-Events werden gestoppt, damit
 * aeussere Modals (React-Events laufen durch Portale hoch) nicht mitreagieren.
 */
export function useModal(
  ref: RefObject<HTMLElement | null>,
  { open, onClose, initialFocusRef }: { open: boolean; onClose: () => void; initialFocusRef?: RefObject<HTMLElement | null> },
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const unlock = lockScroll();
    const root = ref.current;
    if (root) {
      const target = initialFocusRef?.current ?? focusables(root)[0];
      if (target) target.focus();
      else {
        if (!root.hasAttribute("tabindex")) root.tabIndex = -1;
        root.focus();
      }
    }
    return () => {
      unlock();
      if (previous && previous.isConnected) previous.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (e.key === "Tab") {
      e.stopPropagation();
      const root = ref.current;
      if (!root) return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return { onKeyDown };
}

// ---------- Dialog ----------

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  hideTitle?: boolean;
  description?: ReactNode;
  role?: "dialog" | "alertdialog";
  initialFocusRef?: RefObject<HTMLElement | null>;
  size?: "sm" | "md" | "lg";
  placement?: "center" | "sheet";
  closeOnBackdrop?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function Dialog(props: DialogProps) {
  if (!props.open || typeof document === "undefined") return null;
  return createPortal(<DialogPanel {...props} />, document.body);
}

function DialogPanel({
  open,
  onClose,
  title,
  hideTitle = false,
  description,
  role = "dialog",
  initialFocusRef,
  size = "md",
  placement = "center",
  closeOnBackdrop = true,
  footer,
  children,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const { onKeyDown } = useModal(panelRef, { open, onClose, initialFocusRef });

  return (
    <div
      className={clsx(
        "fixed inset-0 z-50 flex justify-center bg-black/50 p-4",
        placement === "sheet" ? "items-end sm:items-center" : "items-center",
      )}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onKeyDown={onKeyDown}
        className={clsx(
          "relative w-full rounded-xl border border-border bg-surface p-5 shadow-overlay max-h-[90dvh] overflow-y-auto",
          size === "sm" && "max-w-sm",
          size === "md" && "max-w-lg",
          size === "lg" && "max-w-2xl",
          className,
        )}
      >
        <h2 id={titleId} className={clsx(hideTitle ? "sr-only" : "pr-8 text-base font-semibold")}>
          {title}
        </h2>
        {description && (
          <div id={descId} className="mt-2 text-sm text-muted">
            {description}
          </div>
        )}
        {children && <div className={clsx(!hideTitle || description ? "mt-4" : undefined)}>{children}</div>}
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        <button
          type="button"
          aria-label="Schließen"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ---------- Segment- / Tab-Leiste ----------

export type SegmentOption<T extends string> = { value: T; label: ReactNode; icon?: LucideIcon; disabled?: boolean };

type SegmentedProps<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  mode?: "tabs" | "radio";
  variant?: "segmented" | "pills";
  idBase?: string;
  panelId?: string;
  fullWidth?: boolean;
  className?: string;
};

/** IDs fuer Tab und Panel – passend zu tabPanelProps. */
const tabId = (idBase: string, value: string) => `${idBase}-tab-${value}`;

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  mode = "tabs",
  variant = "segmented",
  idBase,
  panelId,
  fullWidth = false,
  className,
}: SegmentedProps<T>) {
  const autoId = useId();
  const base = idBase ?? autoId;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabs = mode === "tabs";

  const move = (from: number, dir: 1 | -1) => {
    const n = options.length;
    for (let step = 1; step <= n; step++) {
      const i = (from + dir * step + n) % n;
      if (!options[i].disabled) return i;
    }
    return from;
  };
  const select = (i: number) => {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    refs.current[i]?.focus();
    if (opt.value !== value) onChange(opt.value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = move(i, 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = move(i, -1);
    else if (e.key === "Home") next = move(options.length - 1, 1); // erste aktivierbare
    else if (e.key === "End") next = move(0, -1); // letzte aktivierbare
    if (next === null) return;
    e.preventDefault();
    select(next);
  };

  // Roving tabIndex: die aktive Option, sonst die erste aktivierbare
  const activeIndex = options.findIndex((o) => o.value === value && !o.disabled);
  const focusIndex = activeIndex >= 0 ? activeIndex : options.findIndex((o) => !o.disabled);

  return (
    <div
      role={tabs ? "tablist" : "radiogroup"}
      aria-label={ariaLabel}
      className={clsx(
        variant === "segmented" ? "inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-surface p-1" : "flex flex-wrap gap-2",
        fullWidth && "flex w-full",
        className,
      )}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            id={tabs ? tabId(base, o.value) : undefined}
            role={tabs ? "tab" : "radio"}
            aria-selected={tabs ? selected : undefined}
            aria-checked={tabs ? undefined : selected}
            aria-controls={tabs && panelId ? panelId : undefined}
            disabled={o.disabled}
            tabIndex={i === focusIndex ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={clsx(
              "inline-flex items-center justify-center gap-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              variant === "segmented" ? "h-8 rounded-md px-3" : "h-9 rounded-full px-4",
              fullWidth && "flex-1",
              selected
                ? "bg-brand text-brand-contrast"
                : clsx("text-muted hover:text-text", variant === "pills" && "border border-border bg-surface"),
            )}
          >
            {Icon && <Icon size={14} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Props fuer das Panel zu einer Tab-Leiste (mode="tabs"). */
export function tabPanelProps(idBase: string, panelId: string, value: string) {
  return { id: panelId, role: "tabpanel" as const, "aria-labelledby": tabId(idBase, value), tabIndex: 0 };
}

// ---------- Kopierfeld ----------

export function CopyField({ label, value, className }: { label: string; value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kopieren nicht möglich – markiere den Link und kopiere ihn von Hand.");
    }
  };

  return (
    <div className={clsx("flex gap-2", className)}>
      <Input readOnly aria-label={label} value={value} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 font-mono text-xs" />
      <Button type="button" variant="secondary" onClick={copy}>
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        {copied ? "Kopiert" : "Kopieren"}
      </Button>
    </div>
  );
}
