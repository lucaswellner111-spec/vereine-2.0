"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createShortcutHandler, NEW_POST_EVENT, OPEN_SHORTCUTS_EVENT, SHORTCUT_LIST, shortcutsBlocked } from "@/lib/shortcuts";
import { Dialog, hasOpenEscapeLayer } from "./ui-client";

/** Globale Kuerzel und deren Uebersicht ("?"). Einmal in der App-Huelle eingebunden. */
export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handle = createShortcutHandler({
      navigate: (href) => router.push(href),
      help: () => setOpen(true),
      // "n" nur im Feed: dort klappt das Beitragsfeld auf
      newPost: () => {
        if (pathRef.current !== "/feed") return false;
        window.dispatchEvent(new Event(NEW_POST_EVENT));
        return true;
      },
    });
    const onKey = (e: KeyboardEvent) => {
      // abgeschaltet oder Dialog/Menue offen: Tasten gehoeren dem Dialog
      if (shortcutsBlocked(hasOpenEscapeLayer())) return;
      if (handle(e)) e.preventDefault();
    };
    const show = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SHORTCUTS_EVENT, show);
    };
  }, [router]);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Tastenkürzel" size="sm">
      <dl className="space-y-2 text-sm">
        {SHORTCUT_LIST.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-4">
            <dt>{s.label}</dt>
            <dd className="flex shrink-0 gap-1">
              {s.keys.map((k) => (
                <kbd key={k} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-xs">{k}</kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-muted">Kürzel wirken nicht, während du in einem Eingabefeld schreibst oder ein Dialog offen ist. Abschalten kannst du sie unter Einstellungen → Profil.</p>
    </Dialog>
  );
}
