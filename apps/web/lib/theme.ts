/** Darstellung: "system" (Geraet), "light" oder "dark". Die Wahl liegt nur im Browser (localStorage). */
export type ThemeMode = "system" | "light" | "dark";
export const THEME_KEY = "theme";

/**
 * Laeuft als Inline-Skript im <head>, BEVOR die Seite gezeichnet wird (kein Aufblitzen der falschen Farben).
 * Bewusst ohne Abhaengigkeiten; wrapped in try/catch, weil localStorage blockiert sein kann.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export function readTheme(): ThemeMode {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

const META_COLORS = { light: "#f5f7f5", dark: "#0e1410" } as const;

/** Setzt die Darstellung am <html>-Element, merkt sie sich und passt die Browser-Leistenfarbe an. */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  try {
    if (mode === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* Speichern nicht moeglich: Wahl gilt nur fuer diese Sitzung */
  }
  const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const effective = mode === "system" ? system : mode;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    // Next.js erzeugt je eine Meta-Zeile pro Medienabfrage; bei fester Wahl gilt fuer beide dieselbe Farbe.
    const media = m.getAttribute("media") ?? "";
    m.content = mode === "system" ? (media.includes("dark") ? META_COLORS.dark : META_COLORS.light) : META_COLORS[effective];
  });
}
