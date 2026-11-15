# Nachtlauf-Plan (ab 2026-11-15 abends): Optimieren, Testen, Härten

Auftrag des Nutzers: ohne Zwischenfragen weiterarbeiten, bis die Liste abgearbeitet ist. Stand vorher: Gegencheck P1–P4 (`docs/GEGENCHECK-2026-11-15.md`) erledigt, committet, gepusht, deployt.

## Arbeitsweise (gilt für jedes Paket)
- Leitung: Opus 5.5. Unteragenten immer `model: "sonnet"`, bis zu 3 parallel, jeder mit Spar-Auftrag (gezielt lesen, nur betroffene Tests, Bericht max. 12 Zeilen). Agenten bekommen getrennte Dateibereiche, kein Commit/stash/Branchwechsel durch Agenten.
- Je Paket danach ein unabhängiger **Opus-Prüfer** (Diff lesen, Befunde nach Schwere), Befunde beheben lassen.
- Schlank, kein Overengineering. Neue Logik/Endpunkte mit Tests, Migrationen nur per drizzle-kit. Neue personenbezogene Daten → `docs/DATENSCHUTZ-LAUNCH.md` + `docs/OFFENE-PUNKTE.md`.
- Abschluss je Paket: `npm run typecheck`, API-Tests (`cd apps/api && npx vitest run --testTimeout=120000`), Web-Tests (`--testTimeout=60000`), bei UI-Änderungen `npm run e2e`. Unter Last gescheiterte Tests einzeln wiederholen.
- Fertige Pakete: commit → `git push origin vor-gruendung` → Deploy wie in `infra/README.md`/Memory (Backup VOR Upload, Images als `:prev-DATUM` taggen, `git archive HEAD | ssh … tar -xf -`, geänderte Caddyfiles mit `caddy validate` prüfen und Caddy neu starten, `compose up -d --build`, Smoke-Test, `docker builder prune -f`). Nie zwei Builds gleichzeitig auf dem Server, halbe Sachen nicht deployen.
- Verboten: Geheimnisse ausgeben/committen (auch nicht `CHAT_MASTER_KEYS`), auf dem Server nur Variablennamen ansehen; Testkonten nur lokal; nie „anwaltlich geprüft“, „DSGVO-konform“ als Garantie, „Ende-zu-Ende-verschlüsselt“.
- Ergebnis jedes Pakets hier abhaken und kurz notieren. Verlauf groß → Folgesession mit kompaktem Brief starten (Rest dieser Liste).

## N1: Absicherung des Deploys
- [ ] GitHub-CI für den gepushten Stand prüfen (`gh run list --branch vor-gruendung`), insbesondere `api-postgres` (echtes Postgres) und `e2e`. Fehler beheben.
- [ ] Live-Check klubnest.de (nur lesen, keine Konten anlegen): Startseite, `/datenschutz`, `/eltern-hinweise`, `/agb`, `/api/health/ready` zeigt nur `status`/`worker`, Sicherheits-Header. Server: Migrationen 0033/0034 angewandt, Caddy-Log schwärzt `/einladung/…` (eine eigene Test-URL aufrufen, Log ansehen).

## N2: Opus-Gegencheck der Pakete P1–P4
- [ ] Ein Opus-Prüfer liest `git diff 9d78730..HEAD` (ohne Snapshots) auf Fehler, Sicherheits- und Datenschutzlücken, Text-Widersprüche (Datenschutzerklärung ↔ Code-Fristen ↔ AVV). Befunde mit Sonnet beheben, Tests.

## N3: Tests und Qualität
- [ ] Testlücken schließen: Befehlspalette (veraltete Antworten), Chat-Eingabe Auto-Grow, Pull-to-Refresh, Rate-Limits der öffentlichen Seiten, ICS-Feed mit vielen Terminen.
- [ ] E2E-Rundgang Eltern/Kind (Kind anlegen, zweiter Elternteil, Export, Löschung) und Vorstand ohne 2FA nach Frist, falls noch nicht abgedeckt.
- [ ] Flaky-Tests aus den Läufen suchen und stabilisieren.

## N4: Performance
- [ ] Web: Bundle-Größen gegen `docs/GROESSEN-BUDGET.md` prüfen, größte Seiten verschlanken (dynamische Imports nur wo spürbar).
- [ ] API: langsame Abfragen finden (EXPLAIN auf Feed, Mitgliederliste, Kalender mit PGlite/Postgres-Testdaten), fehlende Indizes per Migration.
- [ ] Lasttest lokal mit `infra/loadtest/k6-smoke.js`, falls k6 vorhanden (nicht gegen klubnest.de).

## N5: UX-Politur
- [ ] Screenshots per `node e2e/design-shots.mjs <ordner>` (lokal) für Handy und Desktop: Feed, Verein, Kalender, Chat, Verwaltung, Kinder, Einstellungen. Auffälligkeiten (Abstände, leere Zustände, Touch-Ziele, Kontrast) gesammelt beheben. Design „Frisch“ (`docs/design/RICHTUNG.md`) einhalten.
- [ ] Barrierefreiheit: axe ohne serious/critical auf allen Hauptseiten, Tastaturbedienung der Dialoge.

## N6: Betrieb
- [ ] Wiederherstellungstest lokal/Server nach `infra/deploy/restore-test.sh` (ohne Live-Daten zu verändern), Ergebnis in `docs/BETRIEB.md`.
- [ ] `docs/OFFENE-PUNKTE.md` aufräumen: erledigte Punkte markieren, Blocker beim Nutzer klar auflisten.

## Nicht ohne Entscheidung des Nutzers
- Jugend E3/E4 (Login für Kinder, Kommentare/Chats): laut `docs/welle2/JUGEND-KONZEPT.md` erst nach Rückmeldung zu den Rechtsfragen. E5 (Übernahme mit 16) nur nach Rücksprache.
- Zahlungen/Spenden (bleiben „Kommt später“), Mailversand aktivieren, Backup-Cron (braucht Freigabe des Nutzers), native Apps (Nutzer: später).

## Abschluss
Am Ende kurzer deutscher Bericht an den Nutzer: was live ist, was offen bleibt, welche Entscheidungen er treffen muss.
