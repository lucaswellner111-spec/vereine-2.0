"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/*
 * Steuerung der App-Huelle (Kopfleiste, Bottom-Nav) durch Seiten.
 * "Immersiv": Am Handy werden Kopfleiste und Bottom-Nav ausgeblendet und das main-Padding entfaellt
 * (z. B. geoeffneter Chat im Vollbild). Mehrere Anforderer per Zaehler (wie lockScroll).
 */

type ShellChrome = { immersive: boolean; acquire: () => () => void };

const ShellChromeContext = createContext<ShellChrome | null>(null);

export function ShellChromeProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const acquire = useCallback(() => {
    setCount((c) => c + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setCount((c) => Math.max(0, c - 1));
    };
  }, []);
  const value = useMemo(() => ({ immersive: count > 0, acquire }), [count, acquire]);
  return <ShellChromeContext.Provider value={value}>{children}</ShellChromeContext.Provider>;
}

/** Ist gerade eine Seite im immersiven Modus? Ohne Provider: false. */
export function useShellChrome(): { immersive: boolean } {
  const ctx = useContext(ShellChromeContext);
  return { immersive: ctx?.immersive ?? false };
}

/** Meldet, solange active true ist, den immersiven Modus an (nur am Handy wirksam, per CSS max-md). */
export function useImmersive(active: boolean) {
  const acquire = useContext(ShellChromeContext)?.acquire;
  useEffect(() => {
    if (!active || !acquire) return;
    return acquire();
  }, [active, acquire]);
}
