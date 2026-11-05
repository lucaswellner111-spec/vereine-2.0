# Research: Konkurrenz, moderne Web-Apps und Ideen für Klubnest

Stand: 5. November 2026. Methode: Web-Suche (Anbieterseiten, Vergleichsportale, App-Store-Texte) plus Abgleich mit dem eigenen Code. **Quellenqualität:** viele Treffer sind Vergleichsportale mit Affiliate-Interesse (trusted.de, softwareabc24, Capterra) und Agentur-Blogs; Preise und Funktionen widersprechen sich teils. Alles mit „(prüfen)“ sollte vor Entscheidungen auf der Anbieterseite verifiziert werden. Lücken der Suche (Heimspiel, Vereinsflieger, PWA/View-Transitions) sind unten benannt.

## 1. Was die Konkurrenz zeigt

| Anbieter | Belegte Merkmale (Quelle) | Relevanz für Klubnest |
|---|---|---|
| **Spond** | Kostenlos nutzbar; „Spond Club“ für Vereine mit mehreren Gruppen, Verwaltung per Browser; automatisierte Zu-/Absage, **Warteliste** bei vollen Terminen, Anwesenheit, **Zahlungen einziehen**, Events ([Spond Hilfe](https://help.spond.com/en/articles/25730-what-is-spond), [Spond Admins](https://www.spond.com/group-admin-coaches/)); App-Store: „Hunderttausende Nutzer monatlich“, alle Sportarten ([App Store](https://apps.apple.com/au/app/spond/id755596884)) | Gratis-Einstieg und Zu-/Absage-Automatik sind der Standard, an dem wir gemessen werden. Warteliste + Anwesenheitsstatistik + Zahlungen fehlen bei uns. |
| **easyVerein** | Modular (4 Pakete): Mitgliederverwaltung, Beitragsabrechnung, Buchhaltung, Termine, Sitzungen; Stärke Buchhaltung; Videokonferenz-Tool; Preise laut OMR ab 7,14 bis 19,38 €/Monat, laut trusted deutlich höher (Lizenzgröße; prüfen); Kritik: veraltete Doku ([OMR](https://omr.com/de/reviews/product/easyverein), [trusted](https://trusted.de/easyverein), [Preisliste](https://easyverein.com/vereinsverwaltungssoftware/preise/)) | Maßstab für Verwaltung. Wettbewerbsvorteil für uns: Feed/Profile/Fans und moderne Oberfläche; Schwäche: Buchhaltung/SEPA fehlen. |
| **campai** | Mitgliederverwaltung, Vereinsapp, Beitragsverwaltung, Buchhaltung, **SEPA-Spendeneinzug**, DATEV-Schnittstelle; Nutzer kritisieren **umständlichen Lastschrifteinzug** ([trusted](https://trusted.de/campai), [GetApp](https://www.getapp.de/software/2055941/campai)) | Zeigt die Schmerzstelle: SEPA-Einzug einfach machen wäre ein echter Vorteil. |
| **Webling, MTH Vereins-Manager, WISO MeinVerein, ClubDesk, S-Verein, Vereinsplaner** | Webling stark bei Beiträgen mit SEPA/EBICS; MTH gelobt für Beitragseinzug/Rechnungen; ClubDesk **Gratis bis 50 Mitglieder**; WISO ab 10 €/Monat bis 100 Mitglieder; Vereinsplaner bis 15 Mitglieder kostenlos; S-Verein ab 6,90 € ([trusted Alternativen](https://trusted.de/easyverein-alternativen), [OMR](https://omr.com/de/reviews/contenthub/software-fuer-mitgliederverwaltung), [Preisübersicht](https://www.softwareabc24.de/verein-software/preise-uebersicht)) | Preisanker: **Gratis-Stufen bis 15/50 Mitglieder sind üblich**, bezahlt wird ab ca. 7–20 €/Monat. Passt zu unserer Hypothese 9–79 € (prüfen im Interview). |
| **Heja** (SE/US) | Kostenlos: Terminplan, **RSVP mit automatischen Erinnerungen**, Team-Chat, Dokumente; werbefinanziert; Pro (ab ca. 8–10 $/Monat): Zahlungsverfolgung, **Anwesenheitsstatistik**, unbegrenzt Admins, werbefrei; **Kinderschutz-Funktion** (Erwachsene–Minderjährige nur mit Wissen der Eltern) ([Heja Preise](https://heja.io/pricing), [App Store](https://apps.apple.com/app/id1157335714)) | Kinderschutz im Chat ist ein starkes Vertrauensargument für Jugendvereine und passt zu unserer Datenschutz-Position. Werbefrei ist bei uns Standard. |
| **SportEasy / TeamSnap** | Kostenlose Version + Test; ab ca. 8 € bzw. 9,99 $ ([Capterra](https://www.capterra.ca/compare/123208/162745/teamsnap/vs/sporteasy)); G2 nennt als Alternativen Spond, SportsPlus, LeagueApps ([G2](https://www.g2.com/products/sporteasy/competitors/alternatives)) | Preisanker ca. 8–10 €/Monat je Team. |
| **Heimspiel, Vereinsflieger** | Suche lieferte **keine belastbaren Daten** (Vereinsflieger nur ein Dokument von 2023 zu Rollen/Flugbuch) | Direkt auf den Anbieterseiten nachsehen. |

**Muster, die sich wiederholen:** (1) kostenlos für Mitglieder, bezahlt der Verein; (2) Zu-/Absage mit automatischer Erinnerung ist Kernfunktion; (3) Zahlungen/Beiträge einziehen ist der Upsell; (4) Anwesenheit und Statistik für Trainer; (5) Jugendschutz wird Verkaufsargument; (6) Verwaltung (easyVerein, campai) und Team-Kommunikation (Spond, Heja) sind getrennte Welten – **Klubnest kann beides verbinden und zusätzlich Reichweite (Feed/Fans) bieten**.

## 2. Moderne Web-App-Muster (Stand der Praxis)
Quellen sind Praxisberichte, keine Primärforschung ([Modern SaaS patterns](https://cdn.jsdelivr.net/npm/@exxatdesignux/ui@0.6.59/consumer-extras/patterns/modern-saas-patterns.md), [DEV: UI Patterns](https://dev.to/plakhlani/top-11-modern-web-development-ui-patterns-to-know-in-2025-215o), [Clay Trends](https://clay.global/blog/web-design-guide/web-design-trends)):
- **Befehlspalette (⌘K / Strg+K):** Suche, Navigation, Aktionen, zuletzt besucht (Linear, Notion, VS Code). Sinnvoll ab ca. 10 Aktionen – bei uns erfüllt (Verwaltung hat 11 Bereiche).
- **Skeleton statt Spinner/„Lade …“**, Layout bleibt stabil.
- **Optimistische Oberfläche:** Aktion sofort zeigen, bei Fehler zurückrollen (Likes, Zusagen, Lesen).
- **Dunkelmodus über Design-Tokens, Barrierefreiheit zuerst, Bento-Raster** für dichte Übersichten.
- **Next.js/React:** Client-Komponenten nur an den Blättern, Hydration-Fehler bei lokalisierten Datumsangaben vermeiden, React-19-Actions und `useOptimistic` für Mutationen ([Next.js-Praxis](https://dev.to/raftlabs/nextjs-best-practices-for-performance-first-teams-2e8m), [Hydration-Lag](https://dev.to/safdarali25/why-your-nextjs-15-app-is-still-slow-and-how-to-fix-react-19-hydration-lag-3pce)). Hinweis: Quellen erwähnen Next.js 16 (Okt. 2025); wir nutzen Next 15 – Upgrade prüfen. Nicht belegt durch die Suche: PWA-Details, View Transitions, TanStack Query.

## 3. Abgleich mit Klubnest (eigener Code, ehrlich)
**Stärken:** DSGVO-Konzept inkl. Löschung/Export; Feed + Profile + Fans + Tags; Termine mit Serien, Zusagen, Kalender-Abo; Chat; Mitgliederverwaltung + Beitragsklassen + Rechnungen (PDF); Einladungslinks; 2FA; Push/PWA; Hell/Dunkel/Automatisch; Moderation; 194 Tests.
**Lücken gegenüber dem Markt:** Zahlungen/SEPA/Spenden (nur Mock); E-Mail (Bestätigung, Reset, Benachrichtigungen); Anwesenheit/Statistik; Warteliste; Umfragen/Abstimmungen; Aufgaben/Helferlisten; Dokumente; Fahrgemeinschaften; Spielplan/Aufstellung (Sportteams); öffentliche Vereinsseiten (SEO); Kinderschutz im Chat; Skeletons/optimistische Oberfläche; Suche global; Barrierefreiheitsprüfung; Onboarding-Assistent; echte Rechtstexte.
**Risiken:** Mindestalter 16 vs. Jugendvereine (Wettbewerber werben gerade mit Elternkonten/Kinderschutz); Demo-Daten mit echten Fotos auf der Domain; Backups manuell.

## 4. Ideen, die sich einfach umsetzen lassen (nach Aufwand/Nutzen)
**Schnell (je ca. 1–2 Std., Frontend):**
1. **Befehlspalette Strg+K** (Seiten, Vereine, Aktionen, Verwaltungsbereiche).
2. **Skeletons** statt „Lade …“ (Feed, Listen, Termine) + weiche Übergänge.
3. **Optimistische Likes und Zusagen** (sofort sichtbar, Rollback bei Fehler).
4. **Leerzustände mit Handlungsaufforderung** und ein **Onboarding-Assistent** („Verein anlegen → Tags → Einladungslink → erster Termin“) mit Fortschrittsanzeige.
5. **Termine nach Tags/Typ filtern** (Training/Spiel/Versammlung) und „Heute/Diese Woche“-Ansicht; Kalender-Wochenansicht.
6. **Eigene Dialoge statt `confirm()`**, Toasts für Rückmeldungen, Tastaturkürzel.
7. **Share-Funktion** für Termin/Beitrag (Link kopieren, Web-Share am Handy) und **Einladungs-QR-Code** zum Ausdrucken (Aushang).
8. **Kurzprofil-Karte** beim Hover/Tippen auf Namen; Verein-Seite mit Kopfbild.

**Mittel (je ca. 0,5–1 Tag, Frontend + API):**
9. **Anwesenheit und Statistik** je Termin/Team (Trainer trägt Teilnahme ein; Quote je Mitglied) – Spond/Heja-Pro-Feature.
10. **Warteliste und Teilnehmerlimit** bei Terminen.
11. **Umfragen/Abstimmungen im Feed** (einfach: Terminumfrage „Welcher Tag passt?“), später rechtssichere Beschlüsse.
12. **Helferlisten/Dienstpläne** (Kuchen, Aufbau) mit Eintragen und Erinnerung.
13. **Fahrgemeinschaften** pro Termin (Plätze anbieten/suchen) – wirkt in Jugendsport stark.
14. **Dokumentenablage light** (PDF/Bilder je Verein/Team, Rechte) – wartet auf Object Storage, mit Größenlimit sofort möglich.
15. **Öffentliche Vereinsseite** (ohne Anmeldung sichtbar: Beschreibung, Tags, Termine, Beitrittsbutton) – SEO und Gewinnung neuer Mitglieder.
16. **Kinderschutz im Chat:** Chats mit Minderjährigen nur in Gruppen mit zwei Erwachsenen bzw. Eltern lesen mit (nach Rechtsprüfung) – Alleinstellung im Datenschutz.
17. **Globale Suche** (Vereine, Personen, Tags, Termine).

**Größer (Tage, brauchen Entscheidungen von dir):** E-Mail-Versand (Mailanbieter), Spenden/Zahlungen (Zahlungsanbieter), SEPA-Beitragseinzug **einfach gemacht** (campai-Schwäche), DATEV-Export, Beitragslauf, Sitzungen/Protokolle, Räume/Reservierungen, Elternkonten.

**Technik/Betrieb (nebenher):** Next.js-Upgrade prüfen; Playwright-E2E in CI; Lighthouse/axe-Prüfung; Backup-Cron + Offsite; Monitoring-Alarme; Fehlertracking (GlitchTip); Bildvarianten/Blurhash-Platzhalter für schnellere Feeds; Dienst-Worker-Update-Hinweis in der App.

## 5. Vorschlag für die Reihenfolge
1. **Woche 1 (Look & Feel, ohne Entscheidungen):** Befehlspalette, Skeletons, optimistische Likes/Zusagen, Dialoge/Toasts, Onboarding-Assistent, QR-Einladung, Termin-Filter.
2. **Woche 2 (Funktionen, die Spond/Heja verkaufen):** Anwesenheit/Statistik, Warteliste/Limit, Umfragen, Helferlisten, Fahrgemeinschaften.
3. **Woche 3 (Wachstum):** Öffentliche Vereinsseite + globale Suche, Dokumente light.
4. **Parallel von dir:** Mailanbieter, Zahlungsanbieter, Mindestalter-Lösung, Rechtstexte – dann E-Mail, Spenden, SEPA.

## 6. Offene Recherche (nächste Runde)
Heimspiel (DFB-nah) und Vereinsflieger direkt auf den Anbieterseiten prüfen; aktuelle Preise von Spond Club; Datenschutz-Positionierung der Wettbewerber (Serverstandort, AVV); Next.js-16-Migration, PWA-/View-Transition-Praxis aus offiziellen Dokumenten.
