"use client";

import { useEffect } from "react";
import { mediaUrl } from "@/lib/media";

/** Vollbild-Ansicht eines Bildes. Schliessen per Escape, Klick auf den Hintergrund oder Knopf. */
export function Lightbox({ ids, index, onIndex, onClose }: { ids: string[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex(Math.min(ids.length - 1, index + 1));
      if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
    };
    document.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
    };
  }, [ids.length, index, onClose, onIndex]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Bildansicht" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl(ids[index], "medium")} alt="Beitragsbild" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      <button type="button" onClick={onClose} aria-label="Schließen" className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1.5 text-white hover:bg-white/25">✕</button>
      {ids.length > 1 && (
        <>
          <button type="button" aria-label="Vorheriges Bild" disabled={index === 0} onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-white hover:bg-white/25 disabled:opacity-30">‹</button>
          <button type="button" aria-label="Nächstes Bild" disabled={index === ids.length - 1} onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-white hover:bg-white/25 disabled:opacity-30">›</button>
          <p className="absolute bottom-4 rounded-full bg-black/50 px-3 py-1 text-xs text-white">{index + 1} / {ids.length}</p>
        </>
      )}
    </div>
  );
}
