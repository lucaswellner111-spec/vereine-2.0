"use client";

import { useEffect } from "react";

/** Registriert den Service Worker (Push, Offline-Hinweis). Ohne Unterstuetzung passiert nichts. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
