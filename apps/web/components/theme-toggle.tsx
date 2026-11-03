"use client";

import clsx from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, readTheme, type ThemeMode } from "@/lib/theme";

const OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: "system", label: "Automatisch", Icon: Monitor },
  { mode: "light", label: "Hell", Icon: Sun },
  { mode: "dark", label: "Dunkel", Icon: Moon },
];

/**
 * Umschalter fuer Automatisch / Hell / Dunkel (Radiogruppe, per Tastatur bedienbar).
 * compact: nur Icons (Kopfleisten); sonst mit Beschriftung (Einstellungen).
 */
export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  // Erst nach dem Laden bekannt (localStorage); bis dahin neutral, damit Server und Client uebereinstimmen.
  const [mode, setMode] = useState<ThemeMode | null>(null);
  useEffect(() => setMode(readTheme()), []);

  const choose = (m: ThemeMode) => {
    setMode(m);
    applyTheme(m);
  };

  const onKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = OPTIONS[(index + (e.key === "ArrowRight" ? 1 : OPTIONS.length - 1)) % OPTIONS.length];
    choose(next.mode);
    (e.currentTarget.parentElement?.querySelector(`[data-mode="${next.mode}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Darstellung" className={clsx("inline-flex rounded-lg border border-border bg-surface p-0.5", className)}>
      {OPTIONS.map(({ mode: m, label, Icon }, i) => {
        const selected = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            data-mode={m}
            aria-checked={selected}
            aria-label={compact ? label : undefined}
            title={label}
            tabIndex={selected || (mode === null && m === "system") ? 0 : -1}
            onClick={() => choose(m)}
            onKeyDown={(e) => onKey(e, i)}
            className={clsx(
              "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
              compact ? "h-8 w-8" : "h-8 px-3",
              selected ? "bg-brand text-brand-contrast" : "text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            <Icon size={16} aria-hidden />
            {!compact && label}
          </button>
        );
      })}
    </div>
  );
}
