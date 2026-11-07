"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { mediaUrl } from "@/lib/media";
import { useSwipe } from "@/lib/use-swipe";
import { useModal } from "./ui-client";

/**
 * Vollbild-Ansicht eines Bildes. Schliessen per Escape, Klick auf den Hintergrund oder Knopf;
 * Pfeiltasten blaettern. Tasten werden am Container behandelt (nicht am document), damit
 * verschachtelte Modals (z. B. Lightbox im Profil-Dialog) sich nicht gegenseitig schliessen.
 */
export function Lightbox({ ids, index, onIndex, onClose }: { ids: string[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { onKeyDown } = useModal(ref, { open: true, onClose, initialFocusRef: closeRef });
  // Wischen links/rechts blaettert
  const swipe = useSwipe({
    axis: "x",
    threshold: 50,
    enabled: ids.length > 1,
    onSwipe: (d) => {
      if (d === "left") onIndex(Math.min(ids.length - 1, index + 1));
      if (d === "right") onIndex(Math.max(0, index - 1));
    },
  });

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Bildansicht"
      className="fixed inset-0 z-50 flex touch-pan-y items-center justify-center bg-scrim/85 p-4"
      {...swipe.handlers}
      onClick={() => {
        if (!swipe.moved()) onClose(); // Wischen ist kein Klick auf den Hintergrund
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.stopPropagation();
          onIndex(Math.min(ids.length - 1, index + 1));
        } else if (e.key === "ArrowLeft") {
          e.stopPropagation();
          onIndex(Math.max(0, index - 1));
        } else onKeyDown(e);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl(ids[index], "medium")} alt="Beitragsbild" className="max-h-full max-w-full select-none rounded-lg object-contain" draggable={false} style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined} onClick={(e) => e.stopPropagation()} />
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Schließen"
        className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-on-scrim/15 text-on-scrim hover:bg-on-scrim/25"
      >
        <X size={20} aria-hidden />
      </button>
      {ids.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Vorheriges Bild"
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index - 1);
            }}
            className="absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-on-scrim/15 text-on-scrim hover:bg-on-scrim/25 disabled:invisible"
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Nächstes Bild"
            disabled={index === ids.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index + 1);
            }}
            className="absolute right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-on-scrim/15 text-on-scrim hover:bg-on-scrim/25 disabled:invisible"
          >
            <ChevronRight size={20} aria-hidden />
          </button>
          <p className="absolute bottom-4 rounded-full bg-scrim/60 px-3 py-1 text-xs text-on-scrim">
            {index + 1} / {ids.length}
          </p>
        </>
      )}
    </div>,
    document.body,
  );
}
