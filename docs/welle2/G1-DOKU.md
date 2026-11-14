# G1: UI-Politur (Safari/iOS-Gefuehl)

Methode: Quelltext-Scan plus Playwright (Chromium, 375 px Touch, 1280 px, hell/dunkel) gegen dev:pglite/next dev. WebKit nicht installiert, daher Safari-Punkte aus dem Quelltext abgeleitet.

## Geprueft ohne Befund
- Verwaltungs-Untermenue links (800 und 1080 px Hoehe, hell/dunkel): kein Ueberlapp (Nav endet vor dem Themen-Umschalter), Scroll ohne Balken, Fokusring auf dem Pfeil sichtbar, Zuklappen per Tastatur ok.
- Mobil 375 px: kein horizontales Scrollen, alle Eingabefelder jetzt >= 16 px.
- Bereits vorhanden: dvh, Safe-Area, -webkit-backdrop-filter, theme-color hell/dunkel, hover nur bei hover:hover (Tailwind v4), press-Feder, reduced-motion, optimistische Updates (useApi.setData), Bilder mit width/height und lazy.

## Behoben (Commit "G1: ...")
1. Eingabefelder (Input/Select/Textarea, Suchpalette) hatten 14 px: iOS zoomt beim Fokus. Jetzt 16 px bei Touch.
2. Skeletons erscheinen erst nach 150 ms (animate-skel): kein Flackern bei schnellen Antworten.
3. Dialog-Hintergrund blendet ein (animate-fade) statt zu springen.
4. Aufgeklapptes Menue-Register steigt sanft auf, Pfeil dreht mit 200 ms.
5. touch-action: manipulation auf Bedienelementen (kein Doppeltipp-Zoom, kein 300-ms-Warten), text-size-adjust, overscroll-behavior-x none, Scrollbereiche mit Momentum und overscroll contain, text-wrap balance/pretty.
6. View-Transitions bei reduzierter Bewegung aus; 60vh im Likers-Sheet auf dvh; decoding=async bei Avataren und Beitragsbildern.

## Offen (Prioritaet)
- P2: Dialoge/Sheets haben keine Schliess-Animation (Unmount sofort). Braucht Exit-State in Dialog (ui-client.tsx), Risiko fuer Tests/Fokus.
- P2: Zuklappen des Menue-Registers ohne Animation (Unmount); mit grid-rows-Trick moeglich, Test nav-group.test.tsx anpassen.
- P3: Seitliche Navigation zeigt bei langem Register keinen Scroll-Hinweis (kein Balken); Fade-Maske am unteren Rand waere moeglich.
- P3: manifest background_color (#f5f7f5) weicht von --bg (#f2f4f1) ab; bei Dunkel kurzer heller Splash beim PWA-Start.
- P3: WebKit-Realtest (Tastatur-Aufsprung, Standalone-PWA, Datums-Eingaben) auf einem echten iPhone nachholen.
