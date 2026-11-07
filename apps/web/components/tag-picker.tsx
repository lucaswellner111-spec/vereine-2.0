"use client";

import clsx from "clsx";
import { Check, Search, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { TAGS, TAG_GROUPS, tagLabel } from "@vereine/shared";
import { Input } from "./ui";

/**
 * Auswahl aus dem festen Tag-Katalog (Sportarten/Themen), gruppiert und durchsuchbar.
 * Ausgewaehlte Tags stehen oben als entfernbare Chips; bei Erreichen des Limits sind weitere gesperrt.
 */
export function TagPicker({ value, onChange, max, label = "Tags", hint }: { value: string[]; onChange: (tags: string[]) => void; max: number; label?: string; hint?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const id = useId();
  const term = q.trim().toLowerCase();
  const full = value.length >= max;

  const groups = useMemo(
    () =>
      TAG_GROUPS.map((g) => ({ group: g, tags: TAGS.filter((t) => t.group === g && (!term || t.label.toLowerCase().includes(term))) })).filter((g) => g.tags.length > 0),
    [term],
  );

  const toggle = (tag: string) => onChange(value.includes(tag) ? value.filter((v) => v !== tag) : full ? value : [...value, tag]);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span id={`${id}-label`} className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted">{value.length}/{max}</span>
      </div>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Ausgewählte Tags">
          {value.map((t) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => toggle(t)}
                aria-label={`${tagLabel(t)} entfernen`}
                className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/20 pointer-coarse:py-2"
              >
                {tagLabel(t)} <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-sm font-medium text-brand hover:underline">
        {open ? "Auswahl schließen" : value.length ? "Tags ändern" : "Tags auswählen"}
      </button>
      {hint && !open && <p className="text-xs text-muted">{hint}</p>}

      {open && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="relative border-b border-border p-2">
            <Search size={14} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            {/* pl-8 = Platz fuer das Such-Icon (Ausnahme der className-Regel; pl-* steht in Tailwind v4 nach px-*) */}
            <Input
              type="search"
              size="sm"
              aria-labelledby={`${id}-label`}
              placeholder="Sportart oder Thema suchen …"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-8"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {groups.length === 0 && <p className="p-2 text-sm text-muted">Kein passender Tag. Wähle „Sonstiges“.</p>}
            {groups.map(({ group, tags }) => (
              <fieldset key={group} className="mb-3 last:mb-0">
                <legend className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{group}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => {
                    const selected = value.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        disabled={!selected && full}
                        onClick={() => toggle(t.id)}
                        className={clsx(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:py-2",
                          selected ? "border-brand bg-brand/15 font-medium text-brand" : "border-border text-text hover:bg-surface-2",
                        )}
                      >
                        {selected && <Check size={12} aria-hidden />}
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
