# Design-Briefing Klubnest (für Design-Sessions)

Du arbeitest am Design von **Klubnest** (klubnest.de). Lies dieses Briefing vollständig, danach `CLAUDE.md`, `docs/ARCHITEKTUR.md` und `docs/DATENSCHUTZ-LAUNCH.md`. Prüfe jede Aussage zum Funktionsstand im Code, bevor du sie in die Oberfläche schreibst. Dieses Briefing beschreibt den Stand vom 2026-11-12.

---

## 1. Worum es geht

Klubnest ist die **Vereins-App für Deutschland**: Verwaltung, Kommunikation und Community in einer App, DSGVO-konform und vollständig in Deutschland gehostet (Hetzner).

**Das Problem heute:** Ein typischer Verein arbeitet mit vielen getrennten Werkzeugen:
- WhatsApp-Gruppen für die Absprachen (datenschutzrechtlich heikel)
- Excel-Listen für die Mitglieder
- ein Verwaltungsprogramm für Beiträge
- Doodle für Termine
- Instagram/Facebook für die Öffentlichkeit
- Papier am schwarzen Brett

Daten liegen verstreut, oft bei US-Anbietern. Ehrenamtliche verlieren Zeit.

**Unsere Antwort:** Eine App für alles, was im Vereinsleben passiert:
- **Für Vorstände und Kassenwarte:** Mitglieder, Beiträge, Rechnungen, Termine, Einladungen, Moderation.
- **Für Mitglieder:** Feed, Chat, Termine mit Zu- und Absage, Helferlisten, eigene Rechnungen, eigene Daten.
- **Für Fans und Interessierte:** Vereinen folgen, öffentliche Vereinsseiten, Vereinsfinder nach Ort und Sportart.

**Unser Vorsprung:** Reine Verwaltungsprogramme wie easyVerein kennen keine Community. Reine Termin-Apps wie Spond haben keine Verwaltung. Social Media wie Instagram oder WhatsApp ist nicht DSGVO-konform und hat keine Vereinsstruktur. Klubnest verbindet **Verwaltung + Social + Datenschutz als Produkt**.

**Betreiber:** eine UG/GmbH, B2B2C. Vereine sind Mandanten; Nutzer sind Vorstände, Mitglieder und Fans.

---

## 2. Was schon gebaut ist (live auf klubnest.de, Vorschau mit Testdaten)

**Konto und Sicherheit**
- Registrierung und Login mit Cookie-Sitzungen, Zwei-Faktor-Anmeldung (TOTP), Sitzungsverwaltung, Passwort ändern.
- In Arbeit: E-Mail-Bestätigung, „Passwort vergessen“, Mailversand über Scaleway (EU) mit Kostenbremse.

**Social**
- Profile wie bei Instagram: Handle, Bio, Avatar, Fotos-Raster, Follower/Folgt, private Profile mit Anfragen.
- Feed mit nachvollziehbarem Ranking. Der chronologische Feed ist der Standard. Dazu „Warum sehe ich das?“ und „Weniger davon“.
- Beiträge mit Bildern (EXIF wird entfernt), Likes, Kommentare, Umfragen und Tags. Tags kommen aus einem festen Katalog von Sportarten und Vereinsthemen, es gibt keine freien Hashtags.
- Beitrags-Detailseite, Teilen, Bearbeiten, Melden.
- Benachrichtigungen mit eigener Seite, Glocke und Web-Push.
- Geplant als nächstes Paket: gebündelte Likes („Anna und 3 weitere …“), Antworten auf Kommentare, @Erwähnungen, eine Seite „Aktivität“ mit Tabs und Live-Pop-ups.

**Chat**
- 1:1- und Gruppenchats, Vereins- und Team-Gruppen.
- Die Inhalte liegen verschlüsselt gespeichert (AES-256-GCM).
- Echtzeit über WebSocket.
- Blockieren und Melden, Löschfristen, Ungelesen-Zähler.
- Am Handy öffnet sich der Chat als Vollbild.

**Vereine**
- Vereinsseite mit Logo, Banner, Beschreibung, Ort, Tags, kommenden Terminen und Teams.
- Beitreten per Antrag oder Einladungslink mit QR-Code.
- Öffentliche Vereinsseite ohne Login, Vereinsfinder und Tag-Seiten.

**Termine**
- Kalender mit Monatsansicht.
- Zu- und Absage, Teilnehmerlimit mit Warteliste.
- Helferlisten, Anwesenheit, Terminserien.
- Kalender-Abo (iCal), Erinnerungen.

**Verwaltung (Seitenleiste mit aufklappbarem Untermenü)**
- Übersicht/Dashboard, Anträge, Mitglieder (Rollen: Vorstand, Kassenwart, Moderation, Mitglied).
- Mitgliederliste mit Stammdaten, Beitragsklassen.
- Beitragslauf: Serienrechnungen mit Vorschau.
- Rechnungen mit PDF und GiroCode (QR-Code zum Überweisen), Einladungen, Teams, Termine, Moderation, Vereinsdaten.

**Datenschutz als Funktion**
- Einwilligungs-Center.
- Datenexport (JSON plus Bilder als ZIP).
- Kontolöschung; Rechnungen bleiben anonymisiert erhalten.
- Automatische Löschfristen, kein Tracking, keine Drittanbieter.

**Plattform-Moderation:** Meldungen nach DSA, begründete Entscheidungen, Zugriffsprotokoll.

**Nicht gebaut (in der UI nur „Kommt später“, nie als vorhanden darstellen):** Spenden, Online-Zahlung und SEPA-Lastschrift, Dokumente, Räume und Reservierungen, Sitzungen und Protokolle, rechtssichere Abstimmungen, native Apps (geplant als Capacitor-Hülle derselben Web-App).

---

## 3. Zielgruppen (für wen gestaltest du)

1. **Vorstand oder Kassenwart, 35–65 Jahre, ehrenamtlich, wenig Zeit, oft am Laptop.** Will, dass Mitglieder, Beiträge und Termine mit wenigen Klicks erledigt sind. Hat Angst vor Datenschutzfehlern. Braucht klare Tabellen, eindeutige Knöpfe und Rückfragen vor folgenschweren Aktionen.
2. **Aktives Mitglied, 16–40 Jahre, fast nur am Handy.** Erwartet Instagram-, WhatsApp- und iOS-Niveau. Will schnell zusagen, chatten, Fotos sehen und liken. Lange Formulare schreckt es ab.
3. **Fan, Eltern oder Interessierte.** Folgen Vereinen, sehen öffentliche Beiträge und Termine und finden Vereine in der Nähe.

**Wichtigstes Gerät: das Handy (375 px).** Der Desktop muss sauber funktionieren, vor allem für die Verwaltung.

---

## 4. Designziele

1. **Fühlt sich an wie eine native iOS-App, im Browser.** Das ist ein ausdrücklicher Wunsch des Betreibers:
   - große Titel, die beim Scrollen zu einer kleinen, durchscheinenden Leiste mit Blur zusammenklappen
   - untere Tab-Leiste mit Blur und Haarlinie
   - gruppierte Listen im Stil der iOS-Einstellungen
   - Sheets mit Griffleiste, Wischen zum Schließen und Größenstufen
   - Action-Sheets für destruktive Aktionen
   - weiche Federanimationen, Gedrückt-Zustand (scale 0.97)
   - Seitenübergänge per View-Transitions-API, Pull-to-Refresh
   - Safe Areas für Notch und Home-Leiste
   - Diese Basis wird später auch die Android- und iOS-App.
2. **Jung, lebendig, aber vertrauenswürdig.** Social-Gefühl wie bei Instagram, nicht wie eine Behördensoftware. Gleichzeitig seriös genug, dass ein Vorstand ihr Mitgliederdaten anvertraut.
3. **Ruhig und klar statt „Vibe-Coding“-Optik:**
   - keine Verläufe, Glow-Effekte oder schwebenden Fake-Karten
   - keine Emojis als Icons
   - keine Superlative im Text
   - eine Akzentfarbe, viel Weißraum, klare Hierarchie
4. **Inhalt vor Rahmen.** Fotos, Namen und Termine stehen im Vordergrund, Chrome tritt zurück.
5. **Eine Sprache überall.** Gleiche Abstände, Radien, Höhen, Zustände und Muster auf jeder Seite.

---

## 5. Verbindliche Richtlinien

**Marke und Farben**
- Markengrün `#1b6e45` (im Dunkelmodus heller), heller Hintergrund `#f5f7f5`, dunkler Hintergrund `#0e1410`.
- Farben nur über Tokens in `apps/web/app/globals.css`, nie fest im Code (kein `bg-white`, kein `text-black`).
- Statusfarben über eigene Tokens: success, warn, danger, info. Overlays über `--scrim`.
- Drei Darstellungen: **Hell, Dunkel, Automatisch** (folgt dem Gerät, ohne Aufblitzen). Jede Änderung in beiden Modi prüfen.
- Kontrast nach WCAG 2.1 AA; das Skript `node apps/web/scripts/check-contrast.mjs` muss grün bleiben.

**Typografie**
- Selbst gehostete Schrift: Inter über `next/font`, auf Apple-Geräten ist auch der Systemstapel `-apple-system, system-ui` erlaubt.
- **Niemals Google Fonts oder CDNs.**
- Skala am iOS-Vorbild: Large Title 34, Title 22/20, Body 17 (am Handy), Footnote 13. Tabellenziffern für Beträge.

**Icons und Bilder**
- Nur `lucide-react`.
- Keine Emojis in der UI.
- Bilder nur aus dem eigenen Server bzw. MediaService, keine externen Bild-URLs, kein Hotlinking von Stockfotos.

**Komponenten (wiederverwenden statt neu bauen)**
- `components/ui.tsx`: Button, Input, Select, Textarea, Card, Badge, Avatar, EmptyState, ErrorState, Skeleton, Alert, LinkButton. Ohne Hooks, also auch für Server-Komponenten.
- `components/ui-client.tsx`: Dialog/Sheet, DropdownMenu, SegmentedControl, CopyField, useEscapeLayer.
- `components/ui-hosts.tsx`: `ask()` für Rückfragen, `toast` für Hinweise.
- Hilfen: `lib/use-api.ts` (useApi, useBusy), `lib/use-media-query.ts` (useIsDesktop), `lib/shell.tsx` (useImmersive), Utility `hit-area`, `stackTable`/`CellLabel` (Tabellen werden am Handy zu Karten).
- Neue Muster (LargeTitleHeader, ListGroup/ListRow, ActionSheet, TabBar) als wiederverwendbare Bausteine anlegen, nicht pro Seite.

**Bedienung und Barrierefreiheit**
- Touch-Ziele mindestens 44 px; volle Tastaturbedienung mit sichtbarem Fokus.
- Dialoge mit Fokusfalle und Escape; ARIA nur, wo nötig.
- `prefers-reduced-motion` respektieren: Animationen dann aus oder minimal.
- Jeder Datenbereich hat vier Zustände: **Laden** (Skeleton statt „Lade …“), **Fehler** (mit „Erneut versuchen“), **Leer** (EmptyState mit Icon und Handlungsaufforderung) und **Inhalt**.
- Destruktive Aktionen immer mit Rückfrage, klar beschriftet: „Termin absagen“, „Austreten“, „Endgültig löschen“; nicht „OK“.
- Erfolg als Toast, Fehler direkt am Feld bzw. inline.
- **Avatar und Name einer Person sind überall auf ihr Profil verlinkt**, auch im Chat.
- E2E-Tests mit axe dürfen keine serious/critical-Verstöße zeigen.

**Datenschutz im Design (nicht verhandelbar)**
- Keine Drittanbieter-Requests im Frontend: keine CDNs, Fonts, Tracker, Embeds (Karten nur als reiner Link zu OpenStreetMap).
- Der E2E-Fremd-Host-Wächter muss grün bleiben.
- Privatsphäre sichtbar machen: wer etwas sieht (öffentlich, Mitglieder, Team), Hinweise wie „Warum sehe ich das?“, Datenschutz-Fakten auf der Startseite.
- Keine Dark Patterns:
  - Ablehnen ist genauso leicht wie Zustimmen.
  - Keine vorausgewählten Einwilligungen.
  - Keine künstliche Dringlichkeit.

**Texte**
- Deutsch, **Du-Form**, kurz, freundlich und konkret.
- Keine Fachbegriffe wie „Token“ oder „Session“ in der UI.
- Nichts behaupten, was nicht gebaut ist (siehe Leitplanken-Skill `klubnest-leitplanken`).
- Nicht gebautes zeigt „Kommt später“.

**Technik**
- Next.js 15 App Router, Tailwind v4 mit Tokens.
- Keine Mock-Daten; alles kommt aus der echten API.
- Gemeinsame Bausteine sparsam erweitern; bestehende Tests anpassen statt löschen.
- Keine Nachbildung des Looks fremder Apps: Instagram, iOS und Spond sind nur Orientierung für Qualität und Bedienmuster, nicht für Kopien von Logos, Farben oder Layouts.

---

## 6. Wichtige Seiten (Priorität für Design-Arbeit)

1. **Startseite** (öffentlich): Aussage, zwei Knöpfe, echte Produktvorschau, Abschnitte „Für Vereine / Mitglieder / Fans“, Datenschutz-Fakten, Fußzeile. Die Abschnitte sind einheitlich vollbreit.
2. **Feed:** Beitragskarte (Autor/Verein, Zeit, Inhalt, Bilder, Aktionsleiste), Tag-Filter, eingeklapptes Beitragsfeld am Handy.
3. **Profil:** Kopf wie bei Instagram (Avatar, Zahlen, Bio, Folgen, Nachricht), Fotos-Raster und Beiträge.
4. **Chat:** Liste und Unterhaltung, Blasen, gruppierte Zeitstempel, feste Eingabeleiste, Vollbild am Handy.
5. **Vereinsseite:** Banner, Logo, Folgen/Beitreten, Termine, Teams, Beiträge.
6. **Kalender und Termin-Detail:** Zusagen mit Avatar-Reihe, Warteliste, Helferliste.
7. **Benachrichtigungen bzw. Aktivität:** Abschnitte Heute / Diese Woche / Früher, Vorschaubild, Live-Pop-up.
8. **Einstellungen und Verwaltung:** gruppierte Listen am Handy, Tabellen am Desktop, klare Rollenrechte.
9. **Login und Registrierung:** einfach, vertrauensbildend, Hinweis auf Datenschutz.

---

## 7. Arbeitsweise und Abnahme

- Mobil zuerst (375 px), dann Desktop (1280 px). Immer in Hell und Dunkel prüfen.
- Vorher- und Nachher-Screenshots in `docs/design/vorher` und `docs/design/nachher`.
- Vor der Abgabe:
  - `npm run typecheck`
  - `npm test -w @vereine/web`
  - `npm run build -w @vereine/web`
  - Kontrast-Skript
  - `npm run e2e` (axe, Fremd-Host-Wächter)
- Kein Commit, Push oder Deploy ohne Auftrag. Keine Änderungen an `infra/`, `.env*` oder am Server.
- Bei Zielkonflikten gilt: **Datenschutz und Barrierefreiheit vor Optik, Ehrlichkeit vor Marketing.**
- Am Ende kurz auf Deutsch berichten: was geändert wurde, welche Dateien, Screenshots, was offen bleibt.
