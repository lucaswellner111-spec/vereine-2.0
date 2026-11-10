/**
 * Kurze Vibration als Rueckmeldung (Like, Pull-to-Refresh). Nur wo der Browser sie kann
 * (praktisch Android; iOS-Safari kennt navigator.vibrate nicht) und nicht bei reduzierter Bewegung.
 */
export function haptic(ms = 10): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    navigator.vibrate(ms);
  } catch {
    // manche Browser werfen ohne Nutzergeste – egal
  }
}
