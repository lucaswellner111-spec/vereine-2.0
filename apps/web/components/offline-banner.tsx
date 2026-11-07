"use client";

import clsx from "clsx";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/** Hinweis oben, solange das Geraet offline ist. Startet mit "online" (kein Hydrations-Unterschied). */
export function OfflineBanner({ immersive = false }: { immersive?: boolean }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  // Live-Bereich bleibt im DOM, damit der Wechsel angesagt wird
  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        "pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-[env(safe-area-inset-top)]",
        // Vollbild-Chat am Handy: unter die Kopfzeile, damit Zurueck-Knopf und Titel frei bleiben
        immersive && "max-md:pt-[calc(env(safe-area-inset-top)+4rem)]",
      )}
    >
      {offline && (
        <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text shadow-overlay">
          <WifiOff size={14} aria-hidden className="text-danger" />
          Du bist offline. Änderungen werden erst mit Verbindung gespeichert.
        </p>
      )}
    </div>
  );
}
