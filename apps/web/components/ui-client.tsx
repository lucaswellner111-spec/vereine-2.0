"use client";

import clsx from "clsx";
import { ArrowLeft, Check, Copy, MoreHorizontal, Search, X, type LucideIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useSwipe } from "@/lib/use-swipe";
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

// ---------- Escape-Stapel: Escape schliesst nur die oberste offene Ebene ----------

type EscapeLayer = { id: number; ref: { current: () => void } };
const escapeLayers: EscapeLayer[] = [];
let escapeListening = false;
let nextEscapeId = 0;

/** Ist gerade eine Ebene (Dialog, Menue, Popover) offen? Globale Kuerzel ruhen dann. */
export const hasOpenEscapeLayer = () => escapeLayers.length > 0;

function onWindowEscape(e: globalThis.KeyboardEvent) {
  if (e.key !== "Escape" || e.isComposing || e.defaultPrevented) return;
  const top = escapeLayers[escapeLayers.length - 1];
  if (!top) return;
  e.preventDefault();
  top.ref.current();
}

/**
 * Meldet eine offene Ebene (Dialog, Menue, Popover) im Escape-Stapel an. Ein einziger keydown-Listener
 * auf window ruft bei Escape nur die zuletzt geoeffnete Ebene auf – auch wenn der Fokus gerade
 * auf body liegt (z. B. nach Klick auf Text). Wer Escape selbst behandelt, ruft preventDefault().
 */
export function useEscapeLayer(active: boolean, onEscape: () => void) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  // Reihenfolge nach dem Rendern vergeben (Eltern vor Kindern): Effekte laufen Kind-zuerst, sonst waere
  // bei zwei im selben Render geoeffneten Ebenen die aeussere oben.
  const order = useRef(0);
  if (active && order.current === 0) order.current = ++nextEscapeId;
  if (!active) order.current = 0;
  useEffect(() => {
    if (!active) return;
    const layer: EscapeLayer = { id: order.current || ++nextEscapeId, ref };
    escapeLayers.push(layer);
    escapeLayers.sort((a, b) => a.id - b.id);
    if (!escapeListening) {
      window.addEventListener("keydown", onWindowEscape);
      escapeListening = true;
    }
    return () => {
      const i = escapeLayers.findIndex((l) => l.id === layer.id);
      if (i >= 0) escapeLayers.splice(i, 1);
    };
  }, [active]);
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
  // Escape auch dann, wenn der Fokus ausserhalb des Panels liegt (body)
  useEscapeLayer(open, () => onCloseRef.current());

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
      if (e.nativeEvent.isComposing) return;
      e.stopPropagation();
      e.preventDefault();
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
  // Sheet am Handy: Griffleiste nach unten wischen schliesst (ab 80 px)
  const isSheet = placement === "sheet";
  const swipe = useSwipe({ axis: "y", threshold: 80, onSwipe: (d) => d === "down" && onClose(), enabled: isSheet });

  return (
    <div
      className={clsx(
        "fixed inset-0 z-50 flex justify-center bg-scrim/50 p-4 backdrop-blur-[2px]",
        placement === "sheet" ? "items-end max-sm:px-0 max-sm:pb-0 sm:items-center" : "items-center",
      )}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onKeyDown={onKeyDown}
        style={swipe.offset ? { transform: `translateY(${swipe.offset}px)` } : undefined}
        className={clsx(
          "relative w-full animate-sheet rounded-2xl border border-border/70 bg-surface p-5 shadow-overlay max-h-[90dvh] overflow-y-auto overscroll-contain",
          // Sheet am Handy: unten buendig, runde Oberkanten, Platz fuer die Home-Leiste
          isSheet && "max-sm:rounded-b-none max-sm:rounded-t-[1.375rem] max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))]",
          size === "sm" && "max-w-sm",
          size === "md" && "max-w-lg",
          size === "lg" && "max-w-2xl",
          className,
        )}
      >
        {isSheet && (
          // Griffleiste (nur Handy): Ziehen nach unten schliesst; per Tastatur bleibt Escape/Schliessen-Knopf
          <div aria-hidden className="-mx-5 -mt-5 mb-1 flex h-6 touch-none cursor-grab items-center justify-center sm:hidden" {...swipe.handlers}>
            <span className="h-[5px] w-9 rounded-full bg-border" />
          </div>
        )}
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
          className="hit-area absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ---------- Zurueck per Verlauf ----------

/**
 * Zurueck-Knopf im Stil von BackLink: geht im Verlauf zurueck, ohne Verlauf (Direktaufruf) zu fallback.
 * Fuer Seiten ohne festen Elternbereich (fremdes Profil, Bereiche aus dem "Mehr"-Sheet).
 */
export function BackButton({ fallback, children, className }: { fallback: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className={clsx("mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-text", className)}
    >
      <ArrowLeft size={16} aria-hidden />
      {children}
    </button>
  );
}

// ---------- Suchfeld ----------

type SearchFieldProps = {
  id: string;
  /** Beschriftung fuer Screenreader (sichtbar ist nur der Platzhalter). */
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
};

/** Suchfeld mit Lupe und Loeschen-Knopf; Escape leert ebenfalls (Browser-Standard bei type=search). */
export function SearchField({ id, label, value, onChange, placeholder, className, inputRef }: SearchFieldProps) {
  const own = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? own;
  return (
    <div className={clsx("relative", className)}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <Input
        ref={ref}
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full pl-9 pr-10 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          aria-label="Suche leeren"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          className="hit-area absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
        >
          <X size={14} aria-hidden />
        </button>
      )}
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
        variant === "segmented" ? "inline-flex h-10 items-center gap-0.5 rounded-xl bg-surface-2 p-1" : "flex flex-wrap gap-2",
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
              "press inline-flex items-center justify-center gap-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50",
              variant === "segmented" ? "h-8 rounded-[0.5rem] px-3.5" : "h-9 rounded-full px-4",
              fullWidth && "flex-1",
              selected
                ? variant === "segmented"
                  ? "bg-surface text-text shadow-card"
                  : "bg-brand bg-brand-grad text-brand-contrast shadow-glow"
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

// ---------- Aufklappmenue (DropdownMenu) ----------

export type MenuAction = {
  type?: "item";
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};
export type MenuEntry = MenuAction | { type: "separator"; id: string } | { type: "group"; id: string; label: string; items: MenuAction[] };

export type MenuTriggerProps = {
  ref: RefObject<HTMLButtonElement | null>;
  id: string;
  type: "button";
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls"?: string;
  "aria-label": string;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
};

type DropdownMenuProps = {
  /** Zugaenglicher Name des Ausloesers und des Menues. */
  label: string;
  items: MenuEntry[];
  align?: "start" | "end";
  /** Bevorzugte Seite; bei Platzmangel wird gekippt. */
  side?: "bottom" | "top";
  /** Eigener Ausloeser; Standard ist ein Icon-Knopf mit drei Punkten. */
  trigger?: (props: MenuTriggerProps) => ReactNode;
  triggerClassName?: string;
  onOpenChange?: (open: boolean) => void;
};

const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

const actionsOf = (items: MenuEntry[]): MenuAction[] =>
  items.flatMap((e) => (e.type === "separator" ? [] : e.type === "group" ? e.items : [e]));

const enabledIndices = (actions: MenuAction[]) => actions.map((a, i) => (a.disabled ? -1 : i)).filter((i) => i >= 0);

/**
 * Menue nach WAI-ARIA (menu/menuitem): Pfeiltasten mit Umlauf, Home/End, Escape und Tab schliessen
 * und geben den Fokus an den Ausloeser zurueck. Liegt als Portal im body (wird in Karten, Dialogen
 * und scrollenden Bereichen nicht abgeschnitten) und kippt bei Platzmangel nach oben/unten.
 */
export function DropdownMenu({ label, items, align = "end", side = "bottom", trigger, triggerClassName, onOpenChange }: DropdownMenuProps) {
  const [open, setOpenState] = useState(false);
  const [initial, setInitial] = useState<"first" | "last">("first");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const triggerId = useId();
  const menuId = useId();
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const openRef = useRef(false);

  const setOpen = useCallback((next: boolean) => {
    if (openRef.current === next) return;
    openRef.current = next;
    setOpenState(next);
    if (!next) setPos(null);
    onOpenChangeRef.current?.(next);
  }, []);

  const actions = actionsOf(items);

  const closeAndFocusTrigger = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, [setOpen]);

  useEscapeLayer(open, closeAndFocusTrigger);

  const place = useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect();
    const m = menuRef.current;
    if (!t || !m) return;
    const mw = m.offsetWidth;
    const mh = m.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = t.bottom + MENU_GAP;
    const above = t.top - MENU_GAP - mh;
    let top = side === "bottom" ? below : above;
    if (side === "bottom" && below + mh > vh - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN) top = above;
    if (side === "top" && above < VIEWPORT_MARGIN && below + mh <= vh - VIEWPORT_MARGIN) top = below;
    top = clamp(top, VIEWPORT_MARGIN, vh - VIEWPORT_MARGIN - mh);
    const left = clamp(align === "end" ? t.right - mw : t.left, VIEWPORT_MARGIN, vw - VIEWPORT_MARGIN - mw);
    setPos({ top, left });
  }, [align, side]);

  // Position vor dem Zeichnen setzen, dann erstes bzw. letztes aktives Item fokussieren
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const enabled = enabledIndices(actions);
    const target = initial === "last" ? enabled[enabled.length - 1] : enabled[0];
    if (target !== undefined) itemRefs.current[target]?.focus();
    else menuRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false); // ohne Fokusverschiebung
    };
    const onScroll = () => place();
    const onResize = () => setOpen(false);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, place, setOpen]);

  if (actions.length === 0) return null;

  const show = (from: "first" | "last") => {
    setInitial(from);
    setOpen(true);
  };

  const focusItem = (i: number | undefined) => {
    if (i !== undefined) itemRefs.current[i]?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = enabledIndices(actions);
    const current = itemRefs.current.findIndex((el) => el !== null && el === document.activeElement);
    const at = enabled.indexOf(current);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusItem(enabled[at < 0 ? 0 : (at + 1) % enabled.length]);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusItem(enabled[at < 0 ? enabled.length - 1 : (at - 1 + enabled.length) % enabled.length]);
        break;
      case "Home":
        e.preventDefault();
        focusItem(enabled[0]);
        break;
      case "End":
        e.preventDefault();
        focusItem(enabled[enabled.length - 1]);
        break;
      case "Escape":
      case "Tab":
        // selbst behandeln: aeussere Dialoge (React-Events laufen durch Portale hoch) reagieren nicht mit
        e.preventDefault();
        e.stopPropagation();
        closeAndFocusTrigger();
        break;
    }
  };

  const select = (a: MenuAction) => {
    if (a.disabled) return;
    setOpen(false);
    triggerRef.current?.focus();
    a.onSelect();
  };

  const triggerProps: MenuTriggerProps = {
    ref: triggerRef,
    id: triggerId,
    type: "button",
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    "aria-label": label,
    onClick: () => (openRef.current ? setOpen(false) : show("first")),
    onKeyDown: (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        show("first");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        show("last");
      }
    },
  };

  let index = 0;
  const renderAction = (a: MenuAction) => {
    const i = index++;
    const Icon = a.icon;
    return (
      <button
        key={a.id}
        ref={(el) => {
          itemRefs.current[i] = el;
        }}
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-disabled={a.disabled || undefined}
        onClick={() => select(a)}
        className={clsx(
          "flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm pointer-coarse:min-h-11 focus:bg-surface-2 focus:outline-none",
          a.disabled ? "cursor-not-allowed opacity-50" : "hover:bg-surface-2",
          a.danger ? "text-danger" : "text-text",
        )}
      >
        {Icon && <Icon size={16} aria-hidden className="shrink-0" />}
        <span className="truncate">{a.label}</span>
      </button>
    );
  };

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-labelledby={triggerId}
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0 }}
            className="fixed z-[60] min-w-48 max-w-[calc(100vw-1rem)] animate-sheet rounded-xl border border-border/70 bg-surface p-1.5 shadow-overlay focus:outline-none"
          >
            {items.map((e) => {
              if (e.type === "separator") return <div key={e.id} role="separator" className="my-1 h-px bg-border" />;
              if (e.type === "group")
                return (
                  <div key={e.id} role="group" aria-label={e.label}>
                    <p aria-hidden className="px-3 pb-1 pt-2 text-xs font-semibold text-muted">
                      {e.label}
                    </p>
                    {e.items.map(renderAction)}
                  </div>
                );
              return renderAction(e);
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {trigger ? (
        trigger(triggerProps)
      ) : (
        <button
          {...triggerProps}
          className={clsx(
            "relative hit-area inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text",
            triggerClassName,
          )}
        >
          <MoreHorizontal size={18} aria-hidden />
        </button>
      )}
      {menu}
    </>
  );
}
