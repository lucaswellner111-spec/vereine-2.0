"use client";

import clsx from "clsx";
import { Building2, CalendarDays, CornerDownLeft, Keyboard, LogOut, MessageSquare, Moon, Monitor, Newspaper, Plus, Search, Settings, Sun, UserSearch, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OrgSummary, PersonItem } from "@vereine/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SETTINGS_ITEMS } from "@/lib/settings-nav";
import { OPEN_PALETTE_EVENT, openShortcuts, shortcutsBlocked } from "@/lib/shortcuts";
import { applyTheme } from "@/lib/theme";
import { itemsForRole, useVerwaltung } from "@/lib/verwaltung";
import { hasOpenEscapeLayer, useModal } from "./ui-client";

type Entry = { id: string; label: string; hint?: string; icon: LucideIcon; group: string; run: () => void };

// Oeffnen per Ereignis (lib/shortcuts), damit die Palette spaet geladen werden kann
export { OPEN_PALETTE_EVENT, openCommandPalette } from "@/lib/shortcuts";

/**
 * Befehlspalette (Strg/Cmd + K oder "/"): schnelle Navigation, Darstellung wechseln, Vereine und Personen suchen.
 * Reine Tastatur-Bedienung moeglich (Pfeile, Enter, Esc); keine externen Dienste.
 */
export function CommandPalette() {
  const router = useRouter();
  const { logout } = useAuth();
  const { role } = useVerwaltung();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [people, setPeople] = useState<PersonItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Fokusfalle, Scroll-Sperre, Escape (Stapel) und Fokus-Rueckgabe wie bei allen Dialogen
  const { onKeyDown: onPanelKeyDown } = useModal(panelRef, { open, onClose: () => setOpen(false), initialFocusRef: inputRef });

  useEffect(() => {
    const show = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      } else if (e.key === "/" && !typing && !e.defaultPrevented && !shortcutsBlocked(hasOpenEscapeLayer())) {
        // Einzeltaste: abschaltbar und gesperrt, solange ein Dialog offen ist (WCAG 2.1.4)
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, show);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setIndex(0);
    }
  }, [open]);

  // Vereine und Personen nachladen (ab 2 Zeichen, entprellt)
  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setOrgs([]);
      setPeople([]);
      return;
    }
    const t = setTimeout(() => {
      api<OrgSummary[]>(`/orgs?q=${encodeURIComponent(q.trim())}`).then((r) => setOrgs(r.slice(0, 4))).catch(() => setOrgs([]));
      api<PersonItem[]>(`/profiles/search?q=${encodeURIComponent(q.trim())}`).then((r) => setPeople(r.slice(0, 4))).catch(() => setPeople([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  const close = () => setOpen(false);
  const go = (href: string) => () => router.push(href);

  const entries = useMemo<Entry[]>(() => {
    const base: Entry[] = [
      { id: "feed", label: "Feed", hint: "g f", icon: Newspaper, group: "Gehe zu", run: go("/feed") },
      { id: "vereine", label: "Vereine entdecken", icon: Building2, group: "Gehe zu", run: go("/vereine") },
      { id: "neu", label: "Verein gründen", icon: Plus, group: "Gehe zu", run: go("/vereine/neu") },
      { id: "personen", label: "Personen finden", icon: UserSearch, group: "Gehe zu", run: go("/personen") },
      { id: "kalender", label: "Kalender", hint: "g k", icon: CalendarDays, group: "Gehe zu", run: go("/kalender") },
      { id: "chat", label: "Chat", hint: "g c", icon: MessageSquare, group: "Gehe zu", run: go("/chat") },
      ...itemsForRole(role).map((i) => ({ id: `v-${i.id}`, label: `Verwaltung: ${i.label}`, icon: i.icon, group: "Verwaltung", run: go(`/verwaltung/${i.id}`) })),
      ...SETTINGS_ITEMS.map((s) => ({ id: `s-${s.href}`, label: `Einstellungen: ${s.label}`, icon: s.icon, group: "Einstellungen", run: go(s.href) })),
      { id: "t-light", label: "Darstellung: Hell", icon: Sun, group: "Aktionen", run: () => applyTheme("light") },
      { id: "t-dark", label: "Darstellung: Dunkel", icon: Moon, group: "Aktionen", run: () => applyTheme("dark") },
      { id: "t-system", label: "Darstellung: Automatisch", icon: Monitor, group: "Aktionen", run: () => applyTheme("system") },
      { id: "shortcuts", label: "Tastenkürzel anzeigen", hint: "?", icon: Keyboard, group: "Aktionen", run: openShortcuts },
      { id: "logout", label: "Abmelden", icon: LogOut, group: "Aktionen", run: () => void logout().then(() => router.replace("/login")) },
    ];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = words.length ? base.filter((e) => words.every((w) => e.label.toLowerCase().includes(w))) : base.slice(0, 9);
    const found: Entry[] = [
      ...orgs.map((o) => ({ id: `o-${o.slug}`, label: o.name, hint: o.city, icon: Building2, group: "Vereine", run: go(`/vereine/${o.slug}`) })),
      ...people.map((p) => ({ id: `p-${p.userId}`, label: p.displayName, hint: `@${p.handle}`, icon: UserSearch, group: "Personen", run: go(`/profil/${p.handle}`) })),
    ];
    return [...found, ...filtered];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, orgs, people, role]);

  useEffect(() => setIndex(0), [q]);

  if (!open) return null;

  const choose = (e: Entry | undefined) => {
    if (!e) return;
    close();
    e.run();
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-scrim/50 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Befehlspalette" onKeyDown={onPanelKeyDown} className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-overlay">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search size={16} aria-hidden className="text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={entries[index] ? `pal-${entries[index].id}` : undefined}
            placeholder="Seite, Verein oder Person suchen …"
            className="h-12 flex-1 bg-transparent text-sm outline-none focus-visible:outline-none placeholder:text-muted"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setIndex((i) => Math.min(entries.length - 1, i + 1)));
              else if (e.key === "ArrowUp") (e.preventDefault(), setIndex((i) => Math.max(0, i - 1)));
              else if (e.key === "Enter") (e.preventDefault(), choose(entries[index]));
            }}
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[11px] text-muted sm:block">Esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-80 overflow-y-auto overscroll-contain p-1.5">
          {entries.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nichts gefunden.</li>}
          {entries.map((e, i) => {
            const header = e.group !== lastGroup ? e.group : null;
            lastGroup = e.group;
            const Icon = e.icon;
            return (
              <li key={e.id} role="presentation">
                {header && <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{header}</p>}
                <button
                  id={`pal-${e.id}`}
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => choose(e)}
                  className={clsx("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm", i === index ? "bg-brand/15 text-brand" : "text-text")}
                >
                  <Icon size={16} aria-hidden className="shrink-0" />
                  <span className="flex-1 truncate">{e.label}</span>
                  {e.hint && <span className="truncate text-xs text-muted">{e.hint}</span>}
                  {i === index && <CornerDownLeft size={13} aria-hidden className="shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted">
          <kbd className="rounded border border-border px-1">↑</kbd> <kbd className="rounded border border-border px-1">↓</kbd> wählen · <kbd className="rounded border border-border px-1">Enter</kbd> öffnen · Strg+K oder / zum Öffnen
        </p>
      </div>
    </div>
  );
}
