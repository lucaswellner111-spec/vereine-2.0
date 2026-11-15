# Nachtlauf-Plan (ab 2026-11-15 abends): Optimieren, Testen, Härten

Auftrag des Nutzers: ohne Zwischenfragen weiterarbeiten, bis die Liste abgearbeitet ist. Stand vorher: Gegencheck P1–P4 (`docs/GEGENCHECK-2026-11-15.md`) erledigt, committet, gepusht und am 15.11. deployt (Commit 73b56a5, 35 Migrationen, Smoke ok, Log-Schwärzung live geprüft). E2E lokal 33/34 grün, `activity.spec.ts` (Desktop) scheiterte nur unter Last und lief einzeln grün.

## Arbeitsweise (gilt für jedes Paket)
- Leitung: Opus 5.5. Unteragenten immer `model: "sonnet"`, bis zu 3 parallel, jeder mit Spar-Auftrag (gezielt lesen, nur betroffene Tests, Bericht max. 12 Zeilen). Agenten bekommen getrennte Dateibereiche, kein Commit/stash/Branchwechsel durch Agenten.
- Je Paket danach ein unabhängiger **Opus-Prüfer** (Diff lesen, Befunde nach Schwere), Befunde beheben lassen.
- Schlank, kein Overengineering. Neue Logik/Endpunkte mit Tests, Migrationen nur per drizzle-kit. Neue personenbezogene Daten → `docs/DATENSCHUTZ-LAUNCH.md` + `docs/OFFENE-PUNKTE.md`.
- Abschluss je Paket: `npm run typecheck`, API-Tests (`cd apps/api && npx vitest run --testTimeout=120000`), Web-Tests (`--testTimeout=60000`), bei UI-Änderungen `npm run e2e`. Unter Last gescheiterte Tests einzeln wiederholen.
- Fertige Pakete: commit → `git push origin vor-gruendung` → Deploy wie in `infra/README.md`/Memory (Backup VOR Upload, Images als `:prev-DATUM` taggen, `git archive HEAD | ssh … tar -xf -`, geänderte Caddyfiles mit `caddy validate` prüfen und Caddy neu starten, `compose up -d --build`, Smoke-Test, `docker builder prune -f`). Nie zwei Builds gleichzeitig auf dem Server, halbe Sachen nicht deployen.
- Verboten: Geheimnisse ausgeben/committen (auch nicht `CHAT_MASTER_KEYS`), auf dem Server nur Variablennamen ansehen; Testkonten nur lokal; nie „anwaltlich geprüft“, „DSGVO-konform“ als Garantie, „Ende-zu-Ende-verschlüsselt“.
- Ergebnis jedes Pakets hier abhaken und kurz notieren. Verlauf groß → Folgesession mit kompaktem Brief starten (Rest dieser Liste).

**Deploy 15.11. (Nachtlauf):** Commit 9504a4b live (Handsicherung `backups/vereine-20261115-111210-vor-nachtlauf.sql.gz`, Images `:prev-20261115-nacht`, Caddy validiert und neu gestartet, 36 Migrationen, Seiten 200, health ok, Log schwärzt `/einladung/`, `?next=` und `/api/guardian/invites/` live geprüft, Build-Cache 2,5 GB geleert, Platte 28 %).

## N1: Absicherung des Deploys
- [x] (15.11.: CI lief nur auf main/PR; `vor-gruendung` in ci.yml aufgenommen, Lauf auf b7d9ef6: build, infra, api-postgres, e2e grün) GitHub-CI für den gepushten Stand prüfen (`gh run list --branch vor-gruendung`), insbesondere `api-postgres` (echtes Postgres) und `e2e`. Fehler beheben.
- [x] (15.11. erledigt: Seiten 200, health nur status/worker, 35 Migrationen, `/einladung/GESCHWAERZT` im Log) Live-Check klubnest.de (nur lesen, keine Konten anlegen): Startseite, `/datenschutz`, `/eltern-hinweise`, `/agb`, `/api/health/ready` zeigt nur `status`/`worker`, Sicherheits-Header. Server: Migrationen 0033/0034 angewandt, Caddy-Log schwärzt `/einladung/…` (eine eigene Test-URL aufrufen, Log ansehen).

## N2: Opus-Gegencheck der Pakete P1–P4
- [x] (15.11.: 9 Befunde, behoben: Caddy-Log schwärzt jetzt `/invites/`, `…einladung/` und alle Query-Werte; Eltern dürfen ruhendes Kind ab 16 bis E5 löschen (Export gesperrt, Texte angepasst); Annahme-Sperre gegen 3 Elternteile; keine Annahme bei ruhendem/zu löschendem Kind; Export mit `guardianInvitesAccepted`; Audit erst nach Löschung; Doku TOM/Löschkonzept. Zweiter Opus-Prüfer auf die Fixes: Befunde behoben) Ein Opus-Prüfer liest `git diff 9d78730..HEAD` (ohne Snapshots) auf Fehler, Sicherheits- und Datenschutzlücken, Text-Widersprüche (Datenschutzerklärung ↔ Code-Fristen ↔ AVV). Befunde mit Sonnet beheben, Tests.

## N3: Tests und Qualität
- [x] (15.11.: neu command-palette.test.tsx, use-pull-to-refresh.test.tsx, events/ics-feed.spec.ts mit 300 Terminen; Auto-Grow und öffentliches Rate-Limit waren schon getestet) Testlücken schließen: Befehlspalette (veraltete Antworten), Chat-Eingabe Auto-Grow, Pull-to-Refresh, Rate-Limits der öffentlichen Seiten, ICS-Feed mit vielen Terminen.
- [x] (15.11.: neu zwei-faktor, konto-loeschen, moderation, kinder-eltern (2. Elternteil, Export, Löschung mit Vorankündigung/Widerspruch), beitragslauf; desktop+mobil grün. Vorstand ohne 2FA nach Frist ist per API-Spec abgedeckt) E2E-Rundgang Eltern/Kind (Kind anlegen, zweiter Elternteil, Export, Löschung) und Vorstand ohne 2FA nach Frist, falls noch nicht abgedeckt.
- [x] (15.11.: kinder-eltern/org-feed scheiterten nur unter Last am ersten Seitenaufbau (10 s); expect-Timeout lokal 15 s, danach 44/44 grün) Flaky-Tests aus den Läufen suchen und stabilisieren.

## N4: Performance
- [x] (15.11.: members-admin aufgeteilt, CSV-Import und AVV-Banner per next/dynamic; beitraege 175.9→129.4, uebersicht 174.7→128.0, mitglieder 173.1→128.3, vereinsdaten 170.8→163.1 KB; Feed 169.6 knapp unter Budget) Web: Bundle-Größen gegen `docs/GROESSEN-BUDGET.md` prüfen, größte Seiten verschlanken (dynamische Imports nur wo spürbar).
- [x] (15.11.: Kern-Abfragen haben Indizes; automatische Prüfung „Fremdschlüssel ohne Index“ fand 6 → Migration 0035_fk_indizes) API: langsame Abfragen finden (EXPLAIN auf Feed, Mitgliederliste, Kalender mit PGlite/Postgres-Testdaten), fehlende Indizes per Migration.
- [ ] (offen: k6 lokal nicht installiert, kein Download ohne Nutzer) Lasttest lokal mit `infra/loadtest/k6-smoke.js`, falls k6 vorhanden (nicht gegen klubnest.de).

## N5: UX-Politur
- [x] (15.11.: `docs/design/nachtlauf-2026-11-15/`, 24 Aufnahmen; behoben: Touch-Ziel Tag-Link Vereinsseite, Mitglieds-Nr. am Handy, Suchtext /vereine gekürzt; Skript um Verwaltung/Kinder/Vereine erweitert; offen Kleinkram: „Abmelden“ leicht eingerückt in der Nutzerkarte) Screenshots per `node e2e/design-shots.mjs <ordner>` (lokal) für Handy und Desktop: Feed, Verein, Kalender, Chat, Verwaltung, Kinder, Einstellungen. Auffälligkeiten (Abstände, leere Zustände, Touch-Ziele, Kontrast) gesammelt beheben. Design „Frisch“ (`docs/design/RICHTUNG.md`) einhalten.
- [x] (15.11.: neu `e2e/tests/a11y-seiten.spec.ts`: Chat, Profil, Verwaltung übersicht/mitglieder/rechnungen/moderation + Tastatur-Fokusfalle im Dialog + Befehlspalette; Fix Chat-Liste `li role=status`) Barrierefreiheit: axe ohne serious/critical auf allen Hauptseiten, Tastaturbedienung der Dialoge.

## N6: Betrieb
- [x] (15.11.: Handsicherung in Wegwerf-DB `restore_probe` eingespielt, 1 s, Zahlen gleich live, wieder gelöscht; `restore-test.sh` selbst braucht age → offen beim Nutzer; Protokoll in BETRIEB.md 5.1a) Wiederherstellungstest lokal/Server nach `infra/deploy/restore-test.sh` (ohne Live-Daten zu verändern), Ergebnis in `docs/BETRIEB.md`.
- [x] (15.11.: Abschnitt „Blocker beim Nutzer“ oben, Erledigtes ans Abschnittsende) `docs/OFFENE-PUNKTE.md` aufräumen: erledigte Punkte markieren, Blocker beim Nutzer klar auflisten.

## N7: Zusatzaufgaben aus dem Backlog (ohne Nutzer machbar, ergänzt 2026-11-15 auf Wunsch des Nutzers)
- [x] Bundle: Verwaltungsseiten (beitraege/uebersicht/mitglieder/vereinsdaten) unter 170 KB gzip (gehört zu N4).
- [x] (war schon umgesetzt, `revokeOpenInvites`) Offene Einladungen widerrufen, sobald der Verein in die Lösch-Sperrfrist geht (`OFFENE-PUNKTE.md` P1).
- [ ] (entfällt vorerst: `social.user_tags` gibt es noch nicht) Interessen-Tags (`social.user_tags`) in den Datenexport, falls noch nicht drin (`OFFENE-PUNKTE.md` P5).
- [x] (Endpunkt `…/member-imports/pending/:id/resend`, Sperre + Limit 50/h, Knopf in der Liste) Import-Einladung „Erneut senden“ (neues Token, alte ungültig) (`OFFENE-PUNKTE.md` S5).
- [x] (`recipientLeft`, bei Kinder-Rechnungen zählt das Kind) Hinweis in der Rechnungsliste auf Entwürfe ausgetretener Mitglieder (`OFFENE-PUNKTE.md` P4c).
- [x] E2E für 2FA einrichten/anmelden, Kontolöschung, Moderation (Meldung → erledigt), Beitragslauf (`OFFENE-PUNKTE.md` Qualität).
- [x] axe auf weiteren Seiten: Verwaltung, Chat, Profil, Kinder (gehört zu N5).
- [x] (`BillingService.purgeExpired`, Schritt `invoices`; bestehende Vereine offen, siehe OFFENE-PUNKTE) Löschjob für finalisierte Rechnungen gelöschter Vereine nach Ablauf der Aufbewahrungsfrist (`PLAN-VOR-GRUENDUNG.md` 19), Frist aus `common/retention.ts`.
- [x] (war schon umgesetzt: `LazyMailDriver`, Compose gibt SMTP_* nur dem worker; OFFENE-PUNKTE nachgezogen) SMTP-Zugang nur im Worker: Treiber in der API erst beim Versand anlegen (`OFFENE-PUNKTE.md` S2, Secrets-Trennung), Compose anpassen.

## Nicht ohne Entscheidung des Nutzers
- Jugend E3/E4 (Login für Kinder, Kommentare/Chats): laut `docs/welle2/JUGEND-KONZEPT.md` erst nach Rückmeldung zu den Rechtsfragen. E5 (Übernahme mit 16) nur nach Rücksprache.
- Zahlungen/Spenden (bleiben „Kommt später“), Mailversand aktivieren, Backup-Cron (braucht Freigabe des Nutzers), native Apps (Nutzer: später).
- **Sicherung auf dem Server:** `infra/deploy/backup.sh` ruft seit dem Deploy vom 14.11. `infra/ops/backup.sh` auf, das `age` und einen Schlüssel braucht und daher abbricht. Bis der Nutzer `age` + Schlüssel (Sicherung des privaten Schlüssels!) einrichtet: vor jedem Deploy von Hand `pg_dump` in `/opt/vereine/backups/` (wie am 15.11.: `docker compose … exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > backups/vereine-<zeit>.sql.gz`, `chmod 600`). Kein Schlüssel ohne den Nutzer erzeugen.

## Abschluss
Am Ende kurzer deutscher Bericht an den Nutzer: was live ist, was offen bleibt, welche Entscheidungen er treffen muss.

## Übergabe (15.11., Pause auf Wunsch des Nutzers)
Weiter mit „Jo, mach weiter“ in dieser Session oder einer neuen: diese Datei lesen, dann hier weiter.
- **Live:** 9504a4b (N1–N4, N6, N7). **Committet und gepusht, NICHT deployt:** der N5-Commit (Screenshots, axe-Spec, Chat-/Vereine-/Mitglieder-Fixes, E2E-Stabilisierung).
- **Nächste Schritte:**
  1. GitHub-CI für den N5-Commit prüfen (`gh run list --branch vor-gruendung`; gh ist installiert, der Nutzer muss einmal `gh auth login` machen, sonst öffentliche API: `curl https://api.github.com/repos/lucaswellner111-spec/vereine-2.0/actions/runs?branch=vor-gruendung`).
  2. Wenn grün: deployen wie oben (Handsicherung pg_dump VOR Upload, Images `:prev-…` taggen, `git archive`, Caddy validieren, `up -d --build`, Smoke, `docker builder prune -f`). Keine Migration im N5-Commit.
  3. Lokal flackerte zuletzt `beitragslauf.spec.ts` (desktop): Der Trace zeigt API-Antworten von 5–8 s statt < 0,3 s, also war der Rechner überlastet (auf Port 3000 lief ein fremder Server, PID 8960). Bei ruhigem Rechner einzeln wiederholen; bleibt es rot, `GET /api/orgs/:slug` auf Hänger untersuchen. Vorher 44/44 grün (4,0 min).
- **Offen ohne Nutzer:** k6-Lasttest (k6 nicht installiert), Interessen-Tags im Export (Tabelle gibt es noch nicht).
- **Entscheidungen des Nutzers:** siehe „Blocker beim Nutzer“ oben in `docs/OFFENE-PUNKTE.md`.
