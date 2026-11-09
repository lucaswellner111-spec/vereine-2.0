

---

# Plan nächste Session (2026-11-09): Mail, Benachrichtigungen, Profil-Links, iOS-Feinschliff, Launch-Vorbereitung

## Context
Stand: P1–P5 live (letzter Commit 5e9c533, 22 Migrationen). **P6 ist zu etwa 90 % gebaut, aber nicht committet** (Nutzungslimit):
- `e2e/` (Playwright, axe, Fremd-Host-Wächter)
- `apps/api/src/testing/` + `vitest.global-setup.ts` (Tests gegen echtes Postgres über `TEST_DATABASE_URL`)
- `src/db/sql-date.spec.ts`
- CI-Jobs
- Doku (CLAUDE.md ist schon nachgezogen)

Wünsche des Nutzers:
- Einladungslink wieder aufrufbar
- Likes, Kommentare und Benachrichtigungen wie bei Instagram (Pop-ups, Aktivitätsseite)
- Profilbild und Name überall verlinkt
- Mail über Scaleway mit Kostenbremse
- Web-Oberfläche so clean wie iOS

Das Wochenlimit des Nutzers ist knapp (etwa 40 %). Deshalb sparsam arbeiten; danach will er Marketing machen.

**Sparsame Arbeitsweise:**
- Frische Session; dieser Plan ist die Übergabe.
- Je Paket **ein** Umsetzer und **ein** Prüfer, der nur den Diff prüft.
- Browser-Prüfung nur bei 375 px und Desktop, nur an den geänderten Stellen.
- Keine Wiederholungs-Reviews bei reinen Kann-Punkten.
- Auslieferung wie bisher: Tests → backup.sh → Commit → Push → Deploy → Prune → Smoke-Test (freigegeben).

## Reihenfolge (Priorität = Nutzen ÷ Aufwand)

### S0 – P6 abschließen (klein, zuerst)
1. `git status` prüfen und die Reste (README) fertig machen.
2. `npm run typecheck`, `npm test` und `npm run e2e` laufen lokal grün.
3. Commit und Push. Kein Deploy nötig, es geht nur um Tests, CI und Doku.
4. CI-Lauf auf GitHub prüfen (`gh run list`).

### S1 – Schnelle Fixes (klein)
1. **Einladungslink erneut anzeigen.**
   - Ursache: Der Token wird nur als SHA-256 gespeichert (`orgs/org-admin.service.ts:98-103`) und kann deshalb nicht wieder angezeigt werden.
   - Lösung:
     - Zusätzlich `token_enc` speichern (AES-256-GCM). Der Schlüssel wird per HKDF aus dem vorhandenen Server-Secret abgeleitet, Kontext „invite“; ein neues Secret ist nicht nötig. Dafür eine Migration.
     - Neuer Endpunkt `GET /orgs/:slug/invites/:id/link` (nur Vorstand, mit Audit).
     - In `components/org-onboarding-admin.tsx` ist jede aktive Einladung antippbar und öffnet einen Dialog mit CopyField, QR, „Teilen“ (`navigator.share`) und „QR speichern“.
   - Alte Einladungen ohne `token_enc` zeigen den Hinweis „Bitte neu erstellen“.
   - Tests.
2. **Profil überall verlinkt.**
   - Neue Bausteine `UserAvatarLink`/`UserNameLink`: Avatar und Name führen zu `/profil/{handle}`. Ohne Handle gibt es keinen Link. Mit Fokuszustand und hit-area.
   - Alle etwa 20 Avatar-Stellen durchgehen:
     - Chat (Kopf bei DM, Absender in Gruppen, Mitgliederliste, Neuer Chat)
     - Kommentare, Like-Liste, Teilnehmer/Zusagen
     - Benachrichtigungen, Personen, Vereinsmitglieder
     - Mitgliederliste in der Verwaltung, Plattform
   - Ein Web-Test prüft jede Avatar-Nutzung mit Personenbezug.

### S2 – Mail-Etappe mit Scaleway + Kostenbremse (mittel)
**Aufgaben des Nutzers vor dem Bau (keine Geheimnisse in den Chat):**
- In der Scaleway Console unter Transactional Email die Domain `klubnest.de` hinzufügen.
- Die angezeigten DNS-Einträge bei Hetzner KonsoleH eintragen, bis Scaleway „verifiziert“ zeigt:
  - SPF und DKIM genau so, wie Scaleway sie anzeigt
  - DMARC zunächst `v=DMARC1; p=none`
- AVV/DPA in der Scaleway-Konsole akzeptieren.
- IAM: einen API-Schlüssel nur mit Berechtigung für Transactional Email erzeugen.
- Per SSH selbst in `/opt/vereine/.env.preview` eintragen:
  - `MAIL_DRIVER=smtp`
  - `SMTP_HOST`: aus der SMTP-Ansicht von Scaleway
  - `SMTP_PORT=587`
  - `SMTP_USER=<Projekt-ID>`
  - `SMTP_PASS=<API-Secret-Key>`
  - `MAIL_FROM="Klubnest <noreply@klubnest.de>"`
  - optional `MAIL_REPLY_TO=kontakt@klubnest.de`
- Dem Assistenten nur sagen: „eingetragen“, dazu die Absender- und Antwortadresse. Keine Werte der Secrets.

**Stand 2026-11-09:**
- Die Punkte 1–4 hat der Nutzer erledigt (Domain, DNS, AVV, API-Schlüssel).
- Das Skript `/opt/vereine/set-mail.sh` liegt auf dem Server. Der Nutzer führt es per `ssh -t` aus; es schreibt `SMTP_*`, `MAIL_FROM` und `MAIL_DRIVER=smtp` in `.env.preview` und legt vorher eine Sicherung an.
- **DNS-Prüfung am 2026-11-09:**
  - SPF: Bei klubnest.de standen **zwei** SPF-Einträge. Das ist ungültig (permerror). Der Nutzer soll sie zu einem einzigen zusammenführen: `v=spf1 +a +mx include:_spf.tem.scaleway.com ~all`.
  - DMARC ist ok.
  - DKIM (Scaleway-Name `<Projekt-ID>._domainkey`) ist eingetragen. Prüfen mit `Resolve-DnsName <name> -Type TXT -Server 1.1.1.1`.
  - Vor der echten Testmail muss Scaleway alles grün zeigen. Gebaut werden kann vorher trotzdem; bis dahin `MAIL_DRIVER=log` lassen.
- **Wichtig:** `infra/deploy/docker-compose.preview.yml` reicht diese Variablen noch NICHT an `api` und `worker` weiter. Deshalb im Bau zuerst `environment` ergänzen: `MAIL_DRIVER: ${MAIL_DRIVER:-log}`, `SMTP_*`, `MAIL_FROM`.
- Vor dem Deploy prüfen, dass alle Werte gesetzt sind (nur Namen prüfen, keine Werte ausgeben). Sonst bricht der API-Start ab.

**Bau:**
- **Kostenbremse** (`mail/mail-limits.ts`, Redis-Zähler, Env mit sicheren Standardwerten):
  - Global: `MAIL_DAILY_LIMIT` (Standard 200) und `MAIL_MONTHLY_LIMIT` (Standard 3000).
  - Je Empfänger höchstens 5 Mails pro Stunde und 20 pro Tag.
  - Je auslösendem Konto höchstens 20 pro Tag.
  - Passwort vergessen und Bestätigung: je IP 5 pro Stunde, je Adresse 3 pro Stunde.
  - Einladungen per Mail: je Verein 100 pro Tag.
  - Vorrang: Wichtige Mails (Passwort, Bestätigung) dürfen bis 100 % des Limits gehen, alles andere stoppt bei 80 %.
  - Bei Überschreitung wird der Job verworfen oder auf den nächsten Tag verschoben.
  - Sichtbarkeit: Zähler und Warnung in `/health/ready` und auf `/plattform` („Mail-Kontingent 82 %“); Log ohne Adresse.
  - Sperrliste `mail.suppressions` (Adressen als Hash) für harte Bounces und Abmeldungen.
  - Tests.
- **Auth-Abläufe:**
  - **E-Mail bestätigen:** Link 24 h gültig. Das Konto ist sofort nutzbar, ein Banner bleibt bis zur Bestätigung. Einladungen und Vereinsgründung erst nach Bestätigung.
  - **Passwort vergessen:** Token 1 h gültig und einmalig; danach werden alle Sitzungen beendet.
  - **Registrierung ohne Konto-Enumeration:** Die Antwort lautet immer „Prüfe dein Postfach“; eine schon vorhandene Adresse bekommt eine Hinweis-Mail.
  - **E-Mail-Adresse ändern:** Bestätigung an die neue Adresse, Info an die alte.
  - `APP_URL` kommt aus `WEB_ORIGIN`.
- **Weitere Mails:**
  - Einladung per Mail (Verwaltung → Einladungen).
  - Neue Rechnung an das Mitglied: Link, kein PDF-Anhang.
  - Benachrichtigungen **nur als tägliche Sammelmail mit Opt-in**, mit Abmeldelink und `List-Unsubscribe`-Header. Keine Einzelmails bei Likes.
- **Datenschutz:** Scaleway als Auftragsverarbeiter (FR) in DATENSCHUTZ-LAUNCH eintragen, Mail-Protokoll ohne Inhalt, Fristen.
- **Abnahme:** Testmail auf dem Server an die Adresse des Nutzers **nur nach seinem Ja**, dann die Header prüfen (SPF/DKIM pass).

### S3 – Aktivität und Benachrichtigungen wie Instagram (mittel–groß)
- **API:**
  - Like-Benachrichtigungen (neu), **gebündelt**: „Anna und 3 weitere gefällt dein Beitrag“. Gruppiert wird je Ziel, Typ und Tag; `actorIds` sind begrenzt, dazu ein Zähler.
  - Kommentar-**Antworten** (eine Ebene, `comments.parent_id`, Migration) mit Benachrichtigung „hat auf deinen Kommentar geantwortet“.
  - Kommentar-Likes.
  - @Erwähnungen von Handles mit Benachrichtigung, nur wenn die erwähnte Person den Beitrag sehen darf.
  - Endpunkte „meine Likes“ (`GET /me/likes`) und „meine Kommentare“ (`GET /me/comments`) mit Keyset-Paging.
- **Seite `/aktivitaet`** (ersetzt bzw. erweitert `/benachrichtigungen`):
  - Tabs „Benachrichtigungen“, „Gefällt mir“, „Kommentare“.
  - Abschnitte „Heute / Diese Woche / Früher“.
  - Eine Zeile zeigt Avatar (verlinkt), Text und rechts ein Vorschaubild des Beitrags.
  - Punkt für ungelesen, „Folgen“-Knopf bei neuen Followern, Wischen zum Ausblenden.
- **Live-Pop-ups:**
  - Benachrichtigungen kommen über den vorhandenen WebSocket-Kanal (Redis-Pub/Sub → chat-gateway, Ereignis `notification`).
  - Oben fährt ein Banner im iOS-Stil ein: Avatar, Text, Vorschaubild.
    - Bedienung: Tippen öffnet das Ziel, nach oben wischen schließt.
    - Anzeige: 4 s lang, höchstens eins gleichzeitig, weitere werden gestapelt gezählt.
    - Kein Banner im gerade offenen Chat derselben Unterhaltung; `prefers-reduced-motion` wird beachtet.
  - Die Glocke kommt ohne Polling aus; Polling bleibt nur als Rückfall.
- Like-Herz mit kleiner Animation, Doppeltipp auf ein Bild = Like, Like-Liste als Sheet.
- Datenschutz-Einträge (Antworten, Erwähnungen, Bündelung). Tests.

### S4 – iOS-Feinschliff der Web-Oberfläche (groß, in zwei Lieferungen)
Ziel: Die Web-App wirkt wie eine native iOS-App, ohne Fremd-Requests. Dieselbe Basis dient später für Capacitor-Apps (iOS/Android).
- **S4a Fundament:**
  - **Tokens** an iOS-Systemfarben angelehnt: gruppierter Hintergrund, Trennlinien 0,5 px, Radien 10/14/22.
  - **Schrift:** Stack `-apple-system, system-ui` auf Apple-Geräten, Inter als Rückfall. iOS-Typo-Skala: Large Title 34, Title 22/20, Body 17, Footnote 13.
  - **Komponenten:**
    - `LargeTitleHeader`: klappt beim Scrollen zur kleinen, durchscheinenden Leiste mit Blur zusammen.
    - `ListGroup`/`ListRow` im Einstellungs-Stil, mit Chevron und Schalter.
    - `TabBar` durchscheinend mit Blur und Haarlinie.
    - `ActionSheet` für destruktive Aktionen.
    - Sheets mit Größenstufen (halb/voll).
  - **Bewegung:**
    - Gedrückt-Zustand mit scale 0.97 für 100 ms, Federanimationen per CSS.
    - Seitenübergänge per View-Transitions-API: neue Seite schiebt von rechts herein, beim Zurück nach rechts hinaus.
    - Pull-to-Refresh in Feed, Aktivität und Chat-Liste.
  - Safe Areas überall; Vibration optional und nur, wo Android sie unterstützt.
- **S4b Seiten umstellen:**
  - Einstellungen und Verwaltung als gruppierte Listen.
  - Profil mit einem Kopf wie bei Instagram/iOS.
  - Chat: Blasen, gruppierte Zeitstempel, feste Eingabeleiste.
  - Feed, Kalender, Aktivität.
  - Kontrast-Skript und axe (E2E) müssen in Hell und Dunkel grün bleiben.
- Optional danach eine Capacitor-Hülle als eigene Etappe. Sie braucht die Apple- und Google-Entwicklerkonten des Nutzers.

### S5 – Launch- und Marketing-Vorbereitung (mittel, teils Nutzer)
- **Ohne Nutzer:**
  - Mitglieder-Import per CSV mit Einladungs-Mails; der wichtigste Hebel für Pilotvereine.
  - Vorab-Anmeldung bzw. Warteliste für Vereine auf der Startseite, mit Double-Opt-in-Mail.
  - Open-Graph-Bild je Verein und Beitrag.
  - Monitoring-Alarm (fehlgeschlagene Jobs, Mail-Kontingent, Platte über 80 %) als Hinweis auf der Plattform-Seite, optional als Mail an den Betreiber.
  - `trusted_proxies` in `infra/deploy/Caddyfile` prüfen.
  - Skript zum Löschen der Demo-Daten bereitstellen.
- **Mit Nutzer:**
  - Hetzner-Firewall (Port 22 nur für die eigene IP).
  - Storage Box und Backup-Cron.
  - Rechtstexte, AVV und Mindestalter mit Anwalt/DSB klären.
  - Indexierung erst zum Launch freischalten (`NEXT_PUBLIC_ALLOW_INDEXING=1`).
  - Marke prüfen.

### Weitere Funde (Backlog, nach Bedarf)
- Globale Suche (Vereine, Personen, Beiträge, Tags)
- Chat: Bilder als Anhänge, Tipp- und Online-Anzeige
- Spenden über Mollie/Stripe Connect (braucht den Nutzer)
- SEPA-Lastschrift
- Dokumente je Verein (Object Storage)
- Export als Job bei großen Konten
- Benachrichtigungen ohne `actor_id` (vor 0021) bereinigen

## Budget-Einschätzung
Mit etwa 40 % Wochenlimit sind **S0, S1 und S2** sicher machbar, **S3** wahrscheinlich. **S4/S5** folgen in der Woche darauf. Die Reihenfolge lässt sich tauschen: Braucht das Marketing zuerst die iOS-Optik, kommt S4a vor S3.

## Verifikation
- Je Paket: typecheck, API- und Web-Tests, `npm run e2e`, Web-Build, Freigabe durch den Prüfer.
- Nach dem Deploy: Smoke-Test, Zahl der Migrationen, Worker-Log.
- Mail: Kontingent-Zähler im Health-Check sichtbar; Testmail nur nach Ja des Nutzers.
