"use client";

import { useEffect } from "react";
import { toast } from "./ui-hosts";

/**
 * Registriert den Service Worker (Push, Offline-Hinweis). Ohne Unterstuetzung passiert nichts.
 * Der SW aktiviert sich per skipWaiting sofort; wechselt der steuernde SW waehrend die Seite offen ist,
 * gibt es eine neue Version -> Hinweis mit "Neu laden" (kein erzwungenes Neuladen, Eingaben bleiben).
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    // Erstinstallation (noch kein Controller) ist kein Update
    let hadController = !!sw.controller;
    let notified = false;
    const onChange = () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      if (notified) return;
      notified = true;
      toast.info("Eine neue Version von Klubnest ist da.", { action: { label: "Neu laden", onClick: () => window.location.reload() } });
    };
    sw.addEventListener("controllerchange", onChange);
    sw.register("/sw.js", { scope: "/" }).catch(() => undefined);
    return () => sw.removeEventListener("controllerchange", onChange);
  }, []);
  return null;
}
