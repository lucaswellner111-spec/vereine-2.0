/*
 * Globale Tastaturkuerzel (nie in Eingabefeldern): "g" dann "f/c/k" springt zu Feed/Chat/Kalender,
 * "n" startet im Feed einen neuen Beitrag, "?" zeigt die Uebersicht. Ereignisse statt direkter Imports,
 * damit Befehlspalette und Uebersicht spaet geladen werden koennen (next/dynamic).
 */

export const OPEN_PALETTE_EVENT = "klubnest:open-palette";
export const OPEN_SHORTCUTS_EVENT = "klubnest:open-shortcuts";
export const NEW_POST_EVENT = "klubnest:new-post";

export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
export const openShortcuts = () => window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT));

export const GOTO: Record<string, { href: string; label: string }> = {
  f: { href: "/feed", label: "Feed" },
  c: { href: "/chat", label: "Chat" },
  k: { href: "/kalender", label: "Kalender" },
};

/** Uebersicht fuer Dialog und Befehlspalette. */
export const SHORTCUT_LIST: { keys: string[]; label: string }[] = [
  { keys: ["Strg", "K"], label: "Befehlspalette öffnen (auch /)" },
  ...Object.entries(GOTO).map(([k, g]) => ({ keys: ["g", k], label: `Zu ${g.label} springen` })),
  { keys: ["n"], label: "Neuer Beitrag (im Feed)" },
  { keys: ["?"], label: "Diese Übersicht anzeigen" },
  { keys: ["Esc"], label: "Dialog oder Menü schließen" },
];

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true;
}

type KeyLike = { key: string; target: EventTarget | null; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; defaultPrevented?: boolean };

/**
 * Zustandsautomat fuer die Kuerzel; liefert true, wenn die Taste verbraucht wurde.
 * "g" wartet hoechstens 1,5 s auf die zweite Taste.
 */
export function createShortcutHandler(actions: { navigate: (href: string) => void; help: () => void; newPost: () => boolean }, now: () => number = Date.now) {
  let gAt = 0;
  return (e: KeyLike): boolean => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return false;
    const key = e.key;
    if (gAt && now() - gAt < 1500) {
      gAt = 0;
      const target = GOTO[key.toLowerCase()];
      if (target) {
        actions.navigate(target.href);
        return true;
      }
      return false;
    }
    gAt = 0;
    if (key === "g") {
      gAt = now();
      return true;
    }
    if (key === "?") {
      actions.help();
      return true;
    }
    if (key === "n") return actions.newPost();
    return false;
  };
}

// ---------- Abschalten (WCAG 2.1.4) und Sperre bei offenen Dialogen ----------

export const SHORTCUTS_STORAGE_KEY = "klubnest.shortcuts";

/** Einzeltasten-Kuerzel an? Standard an; nur localStorage, Zugriffe abgesichert (privater Modus). */
export function shortcutsEnabled(): boolean {
  try {
    return window.localStorage.getItem(SHORTCUTS_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setShortcutsEnabled(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(SHORTCUTS_STORAGE_KEY);
    else window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, "off");
  } catch {
    // Speicher nicht verfuegbar: Einstellung gilt nur bis zum Neuladen nicht
  }
}

/** Kuerzel ruhen lassen: abgeschaltet, ein modaler Dialog offen oder eine Ebene im Escape-Stapel. */
export function shortcutsBlocked(layerOpen: boolean, doc: Document = document): boolean {
  return !shortcutsEnabled() || layerOpen || doc.querySelector('[aria-modal="true"]') !== null;
}
