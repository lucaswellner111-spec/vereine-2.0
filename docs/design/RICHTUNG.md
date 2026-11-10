# Design-Richtung „Frisch“ (S4a, erste Lieferung)

Ziel: Klubnest wirkt jünger, lebendiger und wie eine native App. Das Grün bleibt die Marke.

1. **Farbe:** Das Vereinsgrün bleibt Hauptfarbe. Neu ist ein Verlauf von Waldgrün zu Smaragd für Logo, Hauptknöpfe, Profil-Banner und die Startseite. Als Zweitakzent dient Limette (`--pop`), aber nur als Fläche oder Glanz und nie als Textfarbe, damit der Kontrast stimmt. Likes leuchten Korallrot.
2. **Tiefe:** Der Hintergrund ist gruppiert wie bei iOS. Karten sind weiß bzw. dunkelgrau, haben größere Radien (14/22 px), eine weiche, mehrstufige Schattenlage und nur eine Haarlinie als Rahmen. Kopf- und Tab-Leiste sind durchscheinend mit Blur.
3. **Typografie:** Auf Apple-Geräten kommt die Systemschrift (SF), sonst Inter. Seitentitel sind „Large Titles“ (30–34 px, sehr fett, enges Tracking), Fließtext 15 px. Zahlen sind tabellarisch gesetzt.
4. **Bewegung:** Alles Antippbare federt beim Drücken (scale 0.97). Ein Like lässt das Herz kurz aufploppen. Neue Inhalte steigen sanft auf, Seitenwechsel laufen per View-Transition. Die Tab-Leiste zeigt den aktiven Bereich als Pille. Bei `prefers-reduced-motion` ist alles aus.
5. **Mikrointeraktionen:** Ein-Aus-Schalter federn, das Segment-Steuerelement sieht aus wie bei iOS (Spur mit schwebendem Daumen), Sheets haben runde Oberkanten und eine Griffleiste. Platzhalter schimmern statt zu pulsieren.
6. **Leere Zustände:** Statt grauer Icons gibt es ein Emoji in einem farbigen Kreis und einen freundlichen, kurzen Text in Du-Form (z. B. „Noch ruhig hier 🌱“).
7. **Emoji sparsam:** Emoji stehen nur in leeren Zuständen, auf der Startseite und in Demo-Inhalten, nie in Navigation, Formularen oder Fehlermeldungen. Es gibt keine Fremd-Illustrationen und keine Requests nach außen.
8. **Native-App-Basis:** Safe Areas bleiben überall erhalten, Touch-Ziele sind mindestens 44 px groß, `-webkit-tap-highlight` ist aus und `overscroll` ruhig. Damit sind die Tokens auch die Grundlage für die spätere Capacitor-Hülle.

Screenshots: `vorher/` und `nachher/` (375 px und 1280 px, hell; Start, Feed und Profil auch dunkel). Neu erzeugen mit `node e2e/design-shots.mjs nachher`, solange API und Web lokal laufen.
