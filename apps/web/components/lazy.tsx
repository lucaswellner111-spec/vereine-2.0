"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "./ui";

/*
 * Spaet geladene Bausteine (eigene JS-Chunks): erst laden, wenn sie gebraucht werden.
 * Befehlspalette und Lightbox ohne SSR (rein interaktiv, oeffnen per Ereignis bzw. Klick).
 */
export const LazyCommandPalette = dynamic(() => import("./command-palette").then((m) => m.CommandPalette), { ssr: false });
export const LazyLightbox = dynamic(() => import("./lightbox").then((m) => m.Lightbox), { ssr: false });
export const LazyTagPicker = dynamic(() => import("./tag-picker").then((m) => m.TagPicker), {
  loading: () => <Skeleton className="h-16 w-full" />,
});
export const LazyNewChat = dynamic(() => import("./chat/new-chat").then((m) => m.NewChat), {
  loading: () => (
    <div role="status" aria-label="Lade" className="space-y-3 p-4">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-10 w-full" />
    </div>
  ),
});
export const LazyKeyboardShortcuts = dynamic(() => import("./keyboard-shortcuts").then((m) => m.KeyboardShortcuts), { ssr: false });
