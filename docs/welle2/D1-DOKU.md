# Paket D1: Design-Review-Befunde und Politur (Stand 2026-11-14)

Keine Migration. Nichts wird als „anwaltlich geprüft“ bezeichnet.

## Erledigt (Befund-Nummern aus C1-REVIEW.md)
- **1** Platzhalter-Firmendaten bleiben. `apps/web/scripts/check-legal.mjs`: jeder Build nennt offene Platzhalter als HINWEIS; mit `NEXT_PUBLIC_ALLOW_INDEXING=1` (Launch) bricht der Build ab (`LEGAL_STRICT=0` hebt auf, `=1` erzwingt immer). Test in `lib/legal-config.test.ts`.
- **2** AVV: neue Fassung `2026-11-14-fassung-3` (Status `published`, Kopf „Fassung vom 14.11.2026“, kein Entwurfshinweis). Fassungen 1 und 2 unverändert (Hashes im Test `apps/api/src/avv/avv-document.spec.ts` festgehalten, dritter Hash ergänzt). Zustimmen-Knopf aktiv; `AVV_REQUIRED` bleibt in Produktion aus (Betriebsentscheidung). Hinweis: Vereine mit Zustimmung zu Fassung 2 bekommen bei eingeschaltetem Zwang die 30-Tage-Frist. Status `final` bleibt einer späteren ausdrücklichen Freigabe vorbehalten.
- **3, 4, 5, 6, 7, 16, 17, 22, 29** Touch-Ziele 44 px bei `pointer: coarse` (Button, Input, Select, Segmentschalter, Kopf, Logo, Textlinks per neuer Utility `touch-link`, Beitragskarte, Checkliste); Desktop-Optik unverändert. Checkbox-Zeilen waren schon 44 px (gemessen wurde das 20-px-Feld, das Label ist das Ziel).
- **8** Profil-Link im Kopf ohne `aria-label` (sr-only-Text). **9** Terminseite: gültige `dl`-Struktur. **18** Honeypot zusätzlich `inert`.
- **10** Startseite: „E-Mail-Benachrichtigungen“ ersetzt durch „Sofort-Mails zu einzelnen Ereignissen (die tägliche Sammelmail gibt es schon)“ (Stand im Code: Bestätigungs-/Passwort-Mails und Sammelmail mit Opt-in).
- **11** Kein `/auth/me` auf öffentlichen Seiten ohne Anmeldemerker (`localStorage kn-session`, kein Inhalt); auf App-Seiten wird immer gefragt. **12** `api()` teilt gleichzeitige identische GET-Anfragen (Abbruch zählt je Aufrufer, Test `lib/api.test.ts`).
- **14** Deaktivierte Knöpfe Deckkraft 0,6. **15** Seitenleiste: Navigation scrollt eigenständig, aktiver Eintrag wird sichtbar gehalten, Umschalter/Profil fest unten.
- **20** `/einstellungen/vereinsdaten` heißt jetzt `/einstellungen/mitgliedsdaten` (permanente Weiterleitung). **27** Vereinsseite hatte Kopf und Fuß schon. **28** Auth-Layout mit Fuß (Datenschutz, Impressum).
- A2: CSP-`eval`: Zod läuft im Browser ohne JIT (`packages/shared/src/zod-setup.ts`), der E2E-Filter in `security.spec.ts` ist entfernt (Test grün). auth.spec-Flake: doppelte Navigation beim Abmelden entfernt (nur der Wachposten in `AppShell` leitet um), Bestätigungslink leitet hart per `location.replace` weiter, Rückfall-Timer entfernt. Ursache vermutet (zwei gleichzeitige `router.replace`, unter Last langsame dynamische Seiten durch Nonce-CSP); nicht unter Last wiederholt gemessen.
- **Captcha im Produktions-Build mit `CAPTCHA_ENFORCE=true`: FEHLER GEFUNDEN UND BEHOBEN.** Die Registrierung (`AuthProvider.register`) schickte keine Aufgabe mit (`captcha: true` fehlte): mit Zwang wäre jede Registrierung mit 400 gescheitert. Jetzt grün: Registrieren, Passwort vergessen, Warteliste, Mitgliedsantrag gelingen ohne sichtbare Störung (`e2e/tests/captcha.spec.ts`, Aufruf: `CAPTCHA_ENFORCE=true npx playwright test -c e2e/playwright.config.ts tests/captcha.spec.ts`; bei E2E-Build `API_INTERNAL_URL` auf den E2E-API-Port setzen, die Weiterleitung wird beim Build festgelegt). Login ist nicht geschützt (wie in A2).
- Seitenleiste (Gründer-Beobachtung): Ursache des toten Pfeils war `expanded = active || open` in `NavGroup`; jetzt gilt die ausdrückliche Wahl (automatisch zurückgesetzt beim Betreten/Verlassen des Bereichs), ganze Zeile klappt zu, Navigation scrollt ohne sichtbaren Balken, Fußbereich fest. Test `components/nav-group.test.tsx`. Nicht visuell bei 800/1080 px geprüft.
- B1: Chat-Banner: höchstens eine Abfrage der Unterhaltungsliste je 3 s (Nachrichten werden gesammelt). Live-Banner: pausiert bei Zeiger und Fokus, per Alt+M erreichbar (Eintrag in der Kürzelübersicht, `aria-keyshortcuts`); Inhalt bleibt dauerhaft in `/aktivitaet` (Benachrichtigungen werden gespeichert, Chat in `/chat`).

## Offen / nicht erledigt
- **13** Hydrierungsfehler #418 auf `/verein/<slug>`: nicht reproduziert, keine Ursache gefunden (Server-Komponente mit fester Zeitzone; die Client-Bausteine Umschalter/Auth rendern neutral). Beim nächsten Auftreten Konsole mit Entwicklungs-Build prüfen.
- **19, 21, 23, 24, 25, 26, 30, 31, 32** (Kann-Befunde) nicht angefasst. 21 (Fokusring Datumsfelder): Code nutzt denselben Ring wie alle Felder, im Review vermutlich Messartefakt der Teilfelder.
- Doppelte Requests nur für gleichzeitige Aufrufe behoben; nacheinander gestellte Abfragen derselben Seite bleiben.
- Die Wirkung der Touch-Maße ist nicht auf echten Geräten geprüft.

## Betrieb
- Worktree-Hinweis: Tests im Worktree brauchen `node_modules/@vereine/*` als Verknüpfungen auf die Worktree-Pakete (sonst wird das gebaute `shared` des Hauptordners genutzt).
