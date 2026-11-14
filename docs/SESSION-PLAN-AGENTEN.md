# Session-Plan: Agententeam mit Gegenkontrolle

Stand: 2026-11-13. Inhaltliche Grundlage: `docs/PLAN-VOR-GRUENDUNG.md` (Paketnummern T1–T4 dort). **Sessionleiter = der Hauptassistent in dieser Session.** Er schreibt selbst keinen Fachcode, sondern plant, startet Agenten, nimmt ab und entscheidet an den Toren (Gates). Der Nutzer entscheidet, was ihm vorbehalten ist.

## 1. Regeln (gelten für jeden Agenten)
1. **Kein Commit, Push, Deploy, Servereingriff, keine Mail an echte Adressen** ohne ausdrückliches Ja des Nutzers (CLAUDE.md). Agenten arbeiten im Arbeitsbaum oder in einem Worktree und lassen alles uncommittet.
2. **Zwei Schreiber nie an denselben Dateien.** Parallel schreiben nur Pakete mit getrennten Dateien, je in eigenem Worktree (`isolation: worktree`).
3. **Migrationen nummeriert der Sessionleiter** (nächste frei ist 0025). Parallele Pakete mit Migration werden nacheinander gemergt, nie gleichzeitig.
4. **Umsetzer prüft sich nie selbst.** Jedes Paket hat einen unabhängigen Prüfer, der nur Diff, Tests und Doku sieht, nicht die Gedanken des Umsetzers.
5. **Pflichtliste je Paket:** Zod-Schema aus `packages/shared`, Tests in `apps/api/src/**/*.spec.ts`, Eintrag in `docs/DATENSCHUTZ-LAUNCH.md` (Abschnitt 2/4/5) und `OFFENE-PUNKTE.md`, `exportFor`/`eraseUser`/`purgeExpired` bei neuen Personendaten, `@Inject(Klasse)` im Konstruktor, keine JS-`Date` in `sql\`\``, keine Drittanbieter im Frontend, Texte Deutsch/Du.
6. **Einheitliches Berichtsformat** jedes Agenten (max. 25 Zeilen): Ziel · geänderte Dateien · Tests (Kommando + Ergebnis) · offene Punkte · Risiken · „nicht verifiziert“.
7. **Wochenlimit des Nutzers ist knapp:** höchstens 3 Schreib-Agenten gleichzeitig, kleine Pakete, Prüfer nur auf dem Diff, Browser-Check nur bei 375 px und Desktop an den geänderten Stellen.
8. **Berichte sind keine Beweise.** Der Sessionleiter führt `npm run typecheck`, `npm test` (bei Web-Änderungen `npm test -w @vereine/web`, bei UI zusätzlich `npm run e2e`) selbst aus, bevor ein Tor öffnet.

## 2. Rollen und Gegenkontrollen

| Rolle | Agententyp (verfügbar) | Aufgabe | Wer kontrolliert sie |
|---|---|---|---|
| **Sessionleiter** | Hauptassistent | Reihenfolge, Pakete schneiden, Migrationsnummern, Tore, Merge, Nutzer-Rückfragen | Nutzer; zusätzlich Red-Team (siehe unten) |
| **Umsetzer API** | `general-purpose` (Worktree) | NestJS-Module, Drizzle-Migration, Tests | Prüfer Code + Prüfer Datenschutz |
| **Umsetzer Web** | `general-purpose` (Worktree) | Next.js-Seiten, `ui.tsx`-Bausteine, Web-Tests | Prüfer Code + A11y-Prüfer |
| **Prüfer Code** | `agent-architecture-designer:Inspektor jakości z checklista` (QA Quality) | Diff gegen Spezifikation, Testabdeckung, Lesbarkeit, Grenzen (`boundaries.spec.ts`) | Sessionleiter (Stichprobe) |
| **Prüfer Sicherheit** | `agent-architecture-designer:Ostatnia linia obrony` (QA Security) | OWASP, Secrets, Rate-Limits, Auth-Fehler generisch, Tenant-Trennung | Sessionleiter, bei Befund Rückgabe an Umsetzer |
| **Prüfer Datenschutz** | `general-purpose` mit Skills `gdpr-check`, `ropa`, `dpia` des Plugins gdprgard | Neue Personendaten vollständig? Export/Löschung/Frist/Test vorhanden? Eintrag in DATENSCHUTZ-LAUNCH? | Prüfer Recht-Mapping |
| **A11y-Prüfer** | `agent-architecture-designer:Audytor WCAG` | Kontrast, Tastatur, ARIA, Touch-Ziele, axe-Ergebnisse | Sessionleiter (E2E-Lauf) |
| **Claim-Auditor** | `Explore` (nur lesen) | Gleicht jede Marketing-Aussage mit dem Code ab, Ergebnis als Tabelle „belegt / nicht belegt / falsch“ | zweiter Auditor nach der Korrektur (Gegenprobe) |
| **Recht-Mapper** | `agent-architecture-designer:Tlumacz między legalesem a kodem` | Entwürfe: VVT, TOM, Löschkonzept, DSFA-Gerüst, AVV, Fragenliste für Anwalt | Prüfer Datenschutz + Nutzer/Anwalt (final) |
| **Red-Team** | `venture:devils-advocate` | Greift Pläne, Entscheidungsvorlagen und Release-Urteile mit frischem Kontext an | Sessionleiter muss jeden Einwand beantworten oder annehmen |
| **Betrieb** | `agent-architecture-designer:Automatyzuje droge od commita do produkcji` (DevOps) | Skripte/Compose/CI für Backup, Restore, Monitoring, Rollback; **führt nichts auf dem Server aus** | Prüfer Sicherheit + Nutzer-Freigabe |
| **Marketing-Texter** | `general-purpose` mit Skill `klubnest-leitplanken` | Korrigiert Texte nach Wahrheitsabgleich | Claim-Auditor (Gegenprobe) |
| **Recherche** | `venture:market-researcher`, `competitor-scout` | Zahlungsanbieter-Vergleich (EU), Preisvergleich, Vereinssoftware-Preise | Sessionleiter prüft Quellen; Zahlen als „zu prüfen“ markieren |

Gegenkontrolle als Kette: **Umsetzer → Prüfer Code → Prüfer Sicherheit/Datenschutz/A11y (je nach Paket) → Sessionleiter-Gate (eigene Testläufe) → Nutzer (nur bei Freigaben).** Befunde gehen zurück an denselben Umsetzer (SendMessage), höchstens zwei Runden; danach entscheidet der Sessionleiter oder fragt den Nutzer.

## 3. Tore (Gates)
- **G0 Plan:** Red-Team hat den Plan angegriffen, Einwände sind beantwortet, Nutzer hat A/B entschieden.
- **G1 Paket fertig:** Umsetzer-Bericht im Standardformat, Tests grün in seinem Worktree.
- **G2 Prüfung:** Prüfer Code ohne offene Blocker; je nach Paket Sicherheit, Datenschutz, A11y ohne Blocker.
- **G3 Abnahme durch den Sessionleiter:** `typecheck`, `npm test`, ggf. Web-Tests/E2E selbst gelaufen; Doku-Einträge vorhanden; Migration passt zur Nummer; Merge in den Arbeitsbaum.
- **G4 Auslieferung (nur Nutzer):** Backup → Commit → Push → Deploy → Smoke-Test, jeweils nach seinem Ja.
- **G5 Außenwirkung:** Nichts mit Marketing- oder Rechtsbezug geht raus, bevor der Claim-Auditor „keine falschen Aussagen“ meldet und der Nutzer gelesen hat.

## 4. Wellenplan

### Welle 0 – Lagebild und Gegenprüfung (nur lesen, parallel, keine Konflikte)
- **Claim-Auditor** prüft alle Marketing-Texte (Strategie, Captions, LinkedIn/Facebook-Texte, Folien-Texte, Mailvorlagen, Flyer) gegen den Code. Ergebnis: Tabelle, jede falsche Aussage mit Fundstelle.
- **Recht-Mapper** erstellt die gebündelte Fragenliste für Anwalt/DSB aus `OFFENE-PUNKTE.md` und `DATENSCHUTZ-LAUNCH.md`.
- **Recherche** vergleicht EU-Zahlungsanbieter (Mollie, ggf. weitere) nach Gebühren, SEPA-Lastschrift, Connect-/Plattformmodell, KYC-Dauer, Standort.
- **Red-Team** greift `PLAN-VOR-GRUENDUNG.md` und die Empfehlung A an.
- **Sessionleiter** fasst zusammen, legt dem Nutzer A/B und die Anbieter-Wahl vor. → **G0**.

### Welle 1 – Pilot-Reife (T1), drei parallele Worktrees
- Paket **W1a CSV-Import** (Umsetzer API + Web; Dateien: `members/`, `members-admin.tsx`).
- Paket **W1b Warteliste mit Double-Opt-in** (neues Modul `waitlist/`, Startseite; Migration 0025).
- Paket **W1c AVV-Akzeptanz im Onboarding** (`orgs/`, Onboarding-Komponenten; Migration 0026).
- Prüfer Code + Sicherheit + Datenschutz je Paket; A11y-Prüfer für Web-Teile. Merge nacheinander, Migrationen vom Sessionleiter nummeriert. → **G3**.

### Welle 2 – Recht, Betrieb, Support (parallel)
- **W2a Betrieb:** Backup-Cron-Skript, Offsite, Restore-Skript und Anleitung, Monitoring-Skizze, Rollback-Deploy (DevOps-Agent; Ausführen nur nach Nutzer-Ja).
- **W2b Minderjährige/Jugendvereine:** erst Entscheidungsvorlage (Decision-Presenter-Stil: 2–3 Optionen, Kompromisse), danach Bau.
- **W2c Support-Basis:** Hilfeseite/FAQ, Kontaktweg, DSA-Kontaktstelle, Werkzeug „Vorstand setzen“.
- **W2d Recht-Mapper:** VVT, TOM, Löschkonzept, DSFA-Gerüst, AVV-Entwurf, Datenpannen-Prozess als Entwürfe in `docs/recht/`.
- Prüfer Sicherheit besonders für W2a (Secrets nie in Dateien, nur Namen). → **G3**.

### Welle 3 – Aktivität und iOS-Gefühl (seriell, weil dieselben UI-Dateien)
- **W3a S3 Aktivität** (API zuerst, dann Web), danach **W3b S4a Fundament**, dann **W3c S4b Seiten**. Je Paket ein Umsetzer, Prüfer Code, A11y, E2E (`desktop` und `mobil`, axe Hell/Dunkel).
- Nebenher (read-only/gering): Demo-Verein-Skript mit erfundenen Daten und Löschung der alten Demo-Daten (Nutzer-Freigabe, weil Server).

### Welle 4 – Sicherheit und Qualität
- 2FA-Pflicht für Vorstände/Admins, Bot-Abwehr (ALTCHA), CSP-Nonces, Bounce-Webhook, SMTP-Secrets nur Worker, DB-Rollen-Plan; k6-Lasttest-Skript; E2E-Lücken (2FA, Kontolöschung, Moderation, Beitragslauf).
- QA-Security-Gesamtdurchgang über den gesamten Bestand; Befunde nach Schweregrad, Blocker zuerst.

### Welle 5 – Geld-Vorbereitung bis Testmodus
- Entwurf Datenmodell + Anbieter-Schnittstelle (Plan-Agent), dann Umsetzung Spenden-Gerüst mit Testanbieter und Zuwendungsbestätigung; SEPA-Mandate danach. Prüfer Datenschutz und Sicherheit sind hier Pflicht (Geldfluss nie bei uns, Webhook-Signatur, Idempotenz). Rechtsfragen (ZAG, Zuwendungsbestätigung) bleiben beim Anwalt.

### Welle 6 – Marketing-Ausrichtung und Abschluss
- Marketing-Texter korrigiert nach Wahrheitsabgleich; Claim-Auditor macht die Gegenprobe; Nutzer liest.
- Echte Screenshots/Screenrecordings aus dem Demo-Verein (Browser-Pane, 375 px und Desktop).
- **Abschluss-Review:** Red-Team auf „bereit zur Gründung?“ (Definition in `PLAN-VOR-GRUENDUNG.md` Abschnitt 8), Gesamt-Testlauf, Statusbericht.

## 5. Sessionleiter-Protokoll (jede Welle)
1. Pakete schneiden, Dateien je Paket festlegen, Konflikte ausschließen, Migrationsnummern vergeben.
2. Agenten mit vollständigem Briefing starten (Ziel, Dateien, Regeln aus Abschnitt 1, Berichtsformat, „nichts committen“).
3. Aufgabenliste aktuell halten; auf Rückmeldungen warten, nicht pollen.
4. Berichte lesen, Diff selbst stichprobenartig ansehen, Prüfer starten, Befunde zurückgeben.
5. Eigene Testläufe, Doku-Check, Merge. Kurzes Protokoll in `docs/PLAN-NAECHSTE-SESSION.md` (Stand-Abschnitt).
6. Nutzer informieren: was fertig, was geprüft, was nicht verifiziert, welche Freigabe gebraucht wird.

## 6. Was ich vom Nutzer brauche, um zu starten
1. **Entscheidung A oder B** (Marketing an Ist-Stand anpassen oder Produkt ausbauen) – Empfehlung A.
2. Ja zu **Welle 0** (nur lesen, kein Risiko).
3. Wunschreihenfolge, falls Welle 1 und 2 getauscht werden sollen.
4. Freigaben später einzeln: Backup-Cron, Server-Eingriffe, Demo-Daten löschen, Deploy.
