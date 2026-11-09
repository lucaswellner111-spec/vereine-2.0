# Offene Punkte (Backlog)

Stand: 2026-10-31. Reihenfolge innerhalb einer Gruppe = Empfehlung. "Blockiert durch" nennt, was zuerst passieren muss.

## Sicherheit
| Punkt | Warum | Blockiert durch |
|---|---|---|
| E-Mail-Bestätigung + Passwort-Reset | **Gebaut in S2** (Registrierung antwortet immer 202, kein 409 mehr); aktiv erst mit `MAIL_DRIVER=smtp` | Scaleway-AVV + SPF/DKIM/DMARC |
| Passkeys (WebAuthn); 2FA-Pflicht für Vorstände/Plattform-Admins | TOTP ist gebaut (freiwillig); Pflicht und Passkeys fehlen | – |
| Datenbank-Rollen je Bereich (identity/social/chat/billing) | Least Privilege: ein SQL-Fehler im Chat soll keine Nutzerdaten lesen können | Refactor auf mehrere DB-Verbindungen; sinnvoll beim DB-Server-Umzug |
| CSP mit Nonces statt 'unsafe-inline' | Härtung gegen XSS | Next.js-Middleware |
| Monitoring + Alarme (Prometheus/Grafana/Loki) | Auslöser der Server-Aufteilung sichtbar machen, Worker-Ausfall erkennen | – |
| Virenscan für Uploads (ClamAV) | Bilder werden neu kodiert (sharp); Scan zusätzlich bei Dateianhängen | RAM (~1 GB) → größerer Server |
| Pentest, Dependabot (npm audit läuft bereits in CI) | Vor Echtbetrieb | – |

## Profile / Feed / Medien (neu)
- Feed-Ereignisse (Impression, Klick, Verweildauer) mit kurzer Aufbewahrung als Datenbasis für ML-Ranking – nur mit Einwilligung.
- Video-Uploads, Stories, Hashtags, Beitragssuche, Profil-Verifizierung, Profil-Banner, Bilder-Alt-Texte (Barrierefreiheit).
- Blockieren von Personen (Profile/Kommentare), Melden von Profilen und Bildern in der Plattform-Moderation.
- Handle-Änderungs-Sperrfrist (z. B. 30 Tage) und Weiterleitung alter Handles.
- Medien in Object Storage + CDN, Bildverarbeitung in Worker-Job, Virenscan.

## Betrieb / Infrastruktur
- Hetzner-Cloud-Firewall (22 nur eigene IP, 80/443 offen) – **du**.
- Backup-Cron installieren (Befehl in `infra/README.md`) – braucht deine ausdrückliche Freigabe; Produktion: verschlüsselte Kopie auf Storage Box + WAL-Archivierung (pgBackRest).
- Webhosting-Paket prüfen/kündigen (Domain bleibt?) – **du**.
- Server-Rescale (4 vCPU/8 GB) – **du**, danach Funktionsprüfung durch mich.
- Terraform/Ansible ausführen (statt manuellem Deploy), Remote-State, CI/CD-Deploy statt `tar`.
- Object Storage (Hetzner S3) für Medien statt lokalem Volume, CDN.
- Mailserver/-dienst (später eigener Server) – Entscheidung: zunächst Hetzner-Postfach, später eigener Mailserver auf getrennter Maschine.

## Chat
- Push-Benachrichtigungen (Web-Push/PWA), Dateianhänge/Bilder, „schreibt gerade“, Online-Status, Nachrichten suchen.
- Optional Ende-zu-Ende-Verschlüsselung für 1:1 (MLS/Signal-Protokoll).
- Chat-REST + Schlüssel in eigenen Container/Server (Stufe 3 der Architektur).

## Produkt
- Spenden (Mollie/Stripe Connect, Zuwendungsbestätigungen) – braucht Zahlungsanbieter + Testschlüssel.
- Rechnungen (Verein → Mitglied) sind gebaut (Entwurf/final/bezahlt/Storno, PDF, CSV). Offen: SEPA-Lastschrift und Online-Zahlung, E-Rechnung (XRechnung/ZUGFeRD), echtes DATEV-Format, Mahnstufen, Serienrechnungen/Beitragsklassen, Vereinsanschrift/Steuernummer/IBAN auf der Rechnung (Vereinsstammdaten), Abo-Abrechnung Plattform → Verein.
- Hinweis npm audit: 4 moderate Funde nur in der Entwicklungskette drizzle-kit → esbuild (Dev-Server); nicht im Betrieb, erledigt sich mit einem drizzle-kit-Update.
- ML-Ranking (Phase 4): Ereignis-Erfassung (Impressionen/Klicks, nur mit Einwilligung), Modell, A/B-Tests. Voraussetzung: Feed-Algorithmus v2 und genügend Daten.
- Kalender: Termine einer Serie lassen sich nur gemeinsam absagen (ab einem Termin); Einzeländerungen/Verschieben von Serien fehlen.
- Push: Einstellungen je Mitteilungsart und je Unterhaltung (stumm schalten), Absendername optional, Ruhezeiten; E-Mail-Benachrichtigungen (Mailanbieter).
- Qualität: ~~Ende-zu-Ende-Tests (Playwright) in CI~~ und ~~automatische axe-Prüfung (6 Kernseiten)~~ erledigt (P6, 2026-11-08); ~~API-Tests gegen echtes Postgres~~ erledigt (CI-Job `api-postgres`). Offen: Lasttest mit k6 auf Staging ausführen, manuelle Barrierefreiheitsprüfung (Screenreader, Tastatur) und axe auf weiteren Seiten (Verwaltung, Chat, Profil), E2E für 2FA, Kontolöschung, Moderation, Beitragslauf.
- E2E-Hinweis: Der Web-Produktions-Build erlaubt per CSP nur `wss:`; lokal (HTTP, ws://localhost:4000) fällt der Chat in den E2E-Tests daher auf Polling zurück. Auf klubnest.de (HTTPS) unkritisch.
- Monitoring: Prometheus/Grafana/Alertmanager auf dem Server aufsetzen (Messwerte unter /metrics sind vorbereitet).
- Spenden-Grundgerüst (Datenmodell, Anbieter-Schnittstelle, Test-Anbieter) – bewusst noch nicht begonnen, hängt an der Wahl des Zahlungsanbieters (Mollie/Stripe Connect).
- Mitgliederstammdaten und Beitragsklassen sind gebaut (Etappe 1). Offen: Aufnahmeformular mit Einwilligungen/Eltern, Import (nur per Einladung), Abteilungen = Teams (Zuordnung in der Liste fehlt), AVV-Akzeptanz beim Vereins-Onboarding, Row-Level-Security vor weiteren Verwaltungsmodulen.
- Vereins-Onboarding mit Gemeinnützigkeitsprüfung und Zahlungs-KYC.
- Hashtags, Suche über Beiträge, Stories/Reels (nur falls gewünscht).
- Row-Level-Security (Mandantentrennung) vor dem Verwaltungsmodul.

## Rechtliches
- Datenschutzerklärung, Impressum, AGB (aktuell Platzhalter) – Anwalt/DSB.
- AVV-Vorlage für Vereine, DSFA, Verarbeitungsverzeichnis, ZAG-Abgrenzung Zahlungsfluss, DSA-Kontaktstelle/Transparenzbericht.
- Marken-/Namensprüfung „Klubnest“ (DPMA/EUIPO).
- Barrierefreiheitsprüfung (BFSG, WCAG 2.1 AA).

## Datenschutz/Rechtliches aus Etappe 1 (Details: docs/DATENSCHUTZ-LAUNCH.md)
- **Mindestalter 16 vs. Jugendvereine:** Mitglieder unter 16 brauchen Elternkonto/Zustimmung (Art. 8 DSGVO) – Lösung vor dem Launch festlegen (Elternkonto, das Kinder-Mitgliedschaften verwaltet, oder Mitglied ohne eigenes Konto nur mit Stammdaten).
- Aufbewahrung der pseudonymen Austrittsdaten (Nummer, Eintritt/Austritt, Beitragsklasse) und Namens-Aufbewahrung für Vereinsunterlagen: Anwalt/DSB.
- Fristen festlegen: Benachrichtigungen (umgesetzt P5: 180 Tage), Zugriffsprotokoll (umgesetzt P5: 12 Monate, Moderation 24 Monate, Rechnungsaktionen 10 Jahre), Server-Logs (14 Tage), Backups (14 Tage) → in Löschkonzept aufnehmen, umgesetzte Fristen mit DSB bestätigen.
- AVV-Vorlage für Vereine und digitale Akzeptanz beim Onboarding fehlen (Pflicht, weil die Plattform bei Mitgliederdaten Auftragsverarbeiter ist).

## Demo-Daten auf klubnest.de (angelegt 2026-11-01) – VOR DEM LAUNCH LÖSCHEN
12 Demo-Konten (`@demo.klubnest.invalid`), 2 Vereine (Freiwillige Feuerwehr Wesenberg, FC Blau-Weiß Lindenau), 14 Beiträge mit Fotos echter Personen (auch Kinder), Konto lucaswellner111@gmail.com als Mitglied beider Vereine eingetragen. Anleitung zum Löschen: `infra/demo/README.md`. Datenschutz: Fotos nur nach Anmeldung abrufbar; vor echten Nutzern entfernen (siehe `docs/DATENSCHUTZ-LAUNCH.md`).

## Erscheinungsbild/Tags: offen (Stand 2026-11-03)
- Interessen-Tags je Nutzer (`social.user_tags`) mit „Vereine für dich“, danach Ranking-Bonus **nur mit Einwilligung**; Datenschutz-Eintrag in `docs/DATENSCHUTZ-LAUNCH.md` vorher anlegen (Profildaten, nicht öffentlich, mit Konto löschbar).
- Termine mit Typ-Tags (Training, Spiel, Versammlung), Suche über Vereine/Personen/Tags, Tag-Seiten `/tags/<id>`, „Vereine in deiner Nähe“ (Geodaten, Datenschutz prüfen).
- Design: `Dialog` statt `confirm()`, `Skeleton` statt „Lade …“, Leerzustände mit Handlungsaufforderung, restliche Seiten (Profile, Chat, Spenden) auf die neuen Komponenten, Tab-Leisten innerhalb von Seiten vereinheitlichen, ~~Barrierefreiheitsprüfung (axe)~~ (automatisch in E2E, P6), Mobil-Test auf echten Geräten.
- Demo-Daten auf der Domain haben noch keine Tags (Skript `infra/demo/seed.mjs` setzt sie bei neuem Lauf; bestehende Vereine: `PUT /orgs/<slug>/tags`).
- Moderation: Sperren/Verwarnungen von Nutzern im Verein, Einspruchsverfahren (DSA Art. 20), Transparenzbericht, automatische Spam-Hinweise, Moderationsprotokoll als Ansicht für den Vorstand, Moderation von Chat-Gruppen eines Vereins.
- Bedienkomfort offen: Kurzprofil-Karte beim Antippen von Namen, Wochenansicht im Kalender, Terminen Typen (Training/Spiel) geben, Tastaturkürzel-Übersicht, Skeletons je Seite feiner abstimmen. Recherche-Ideen Block 2 (Anwesenheit, Warteliste, Umfragen, Helferlisten, Fahrgemeinschaften): siehe `docs/RESEARCH-MARKT-UND-UI.md`.

## Härtung Paket P1: offen (Stand 2026-11-07)
- **Art. 20 DSA:** erledigte Chat-Meldungen werden 30 Tage nach der Prüfung gelöscht; das interne Beschwerdeverfahren verlangt, Entscheidungen 6 Monate anfechtbar zu halten → Frist mit Anwalt/DSB klären (z. B. Entscheidung + Begründung 6 Monate, Beweiskopie 30 Tage).
- **Finalisierte Rechnungen gelöschter Vereine** bleiben bis zum Ende der Aufbewahrungsfrist (8–10 Jahre) in `billing.invoices` (Empfänger sieht sie weiter unter „Meine Rechnungen“); ein Löschjob nach Fristablauf fehlt noch. `billing.invoice_counters` bleibt ebenfalls erhalten.
- Grenzfall Vereinslöschung: tritt zwischen Vorprüfung und Löschung jemand bei, bleibt der Verein ohne Vorstand bestehen – Plattform-Werkzeug „Vorstand setzen“ fehlt.
- Meldungen aus der Zeit vor Migration 0016 haben keinen eigenen Schlüssel; wurde ihre Unterhaltung gelöscht, ist die Beweiskopie nicht mehr lesbar (0016 löscht leere Gruppen mit offenen Meldungen deshalb nicht).
- Aufräumen nach Austritt/Vereinslöschung läuft nach dem Commit; stürzt der Prozess genau dazwischen ab, unterbleibt es → später Outbox-Zeile in derselben Transaktion.
- Während der Lösch-Sperrfrist des einzigen Vorstands sind offene Einladungen des Vereins noch gültig → beim Löschen widerrufen.
- Push: wer den (geheimen) Endpunkt eines fremden Geräts kennt, kann dessen Abo durch eigenes Anmelden entfernen; geringes Risiko, akzeptiert.

## Oberfläche Paket Q2: offen (Stand 2026-11-07)
- **Zusagen-Anzeige:** aktive Mitglieder sehen bei internen/Team-Terminen Namen und Profilbilder der Zusagen (ohne eigene Einwilligung). Mit DSB klären, ob Vereinszweck (Art. 6 Abs. 1 lit. b/f) reicht oder ein Opt-out („Meine Zusage nur als Zahl zeigen“) nötig ist.
- Benachrichtigungen kommen per Polling (30 s, pausiert im Hintergrund); Live-Zustellung über den Socket fehlt noch.

## Paket P4a: offen (Stand 2026-11-08)
- **DSA-Beweissicherung bei gelöschten Kommentaren:** „Entfernen“ einer Kommentarmeldung löscht den Kommentar endgültig, die Meldung verschwindet per Kaskade; das Audit-Log enthält nur IDs. Mit DSB/Anwalt klären: Beweiskopie (verschlüsselt, befristet wie bei Chat-Meldungen) und Begründung an den Kommentarautor (Art. 17 DSA; bisher keine Benachrichtigung, da keine neue Art vorgesehen).
- Beitrag bearbeiten speichert keine Versionen; ob für Moderation eine kurze Historie nötig ist, mit der DSA-Frage oben entscheiden.

## Paket P4b: offen (Stand 2026-11-08)
- **Anwesenheit – Frist (DSB):** 24 Monate ab Erfassung, täglicher Löschjob `privacy.retention` seit P5 (mit DSB bestätigen); vorher endet sie mit Austritt, Kontolöschung oder Vereins-/Terminlöschung.
- **Anwesenheit bei Minderjährigen (DSB):** Reicht der Vereinszweck, oder braucht es Information der Erziehungsberechtigten bzw. eine kürzere Frist? Bewusst kein Grund/Freitext bei „entschuldigt“ (keine Gesundheitsdaten).
- **Anwesenheits-Export** (CSV/PDF) für Vereine kommt in P5, ebenso ein Protokolleintrag beim Export.
- **Helferlisten-Namen:** aktive Mitglieder sehen, wer sich eingetragen hat (wie bei den Zusagen, Frage aus Q2: Opt-out „nur als Zahl“?).
- Warteliste: Wer bei einem öffentlichen Termin auf der Warteliste steht und dem Verein entfolgt, bleibt auf der Liste und kann nachrücken (wie Zusagen bisher). Ggf. beim Entfolgen bereinigen.
- Serie bearbeiten: Datum/Uhrzeit ändern sich nur einzeln (Entscheidung 9); eine Verschiebung der ganzen Serie fehlt.
- **Anwesenheit bei öffentlichen Terminen:** Die Liste zeigt nur Personen mit Zusage, die aktive Mitglieder sind (plus bereits Erfasste). Mitglieder ohne Zusage, die trotzdem kommen, lassen sich über die API erfassen, erscheinen in der Oberfläche aber nicht; Follower/Gäste werden nie erfasst (Datenminimierung). Prüfen, ob Vereine eine Suche „Mitglied hinzufügen“ brauchen.
- Wird ein öffentlicher Termin auf intern gestellt, werden Zusagen, Warteliste und Helfer-Einträge von Nicht-Mitgliedern (bzw. Nicht-Teammitgliedern) ohne Benachrichtigung entfernt; ggf. eine Hinweis-Benachrichtigung ergänzen.

## Paket P4c Teil 1: offen (Stand 2026-11-08)
- **Öffentliche Vereinsseite – Rechtsrahmen (Anwalt/DSB):** Art. 26 (gemeinsame Verantwortung) oder AVV mit dem Verein? Verantwortung für veröffentlichte Beitragstexte, Bildrechte bei Logo/Banner; Hinweis an Vereine in Nutzungsbedingungen/AVV aufnehmen. In der Oberfläche steht beim Freischalten ein Hinweis.
- **Datenschutzerklärung für Besucher ohne Konto** (öffentliche Seite, Vereinsfinder: Server-Logs, Rate-Limit je IP 60/min) vor `NEXT_PUBLIC_ALLOW_INDEXING=1` ergänzen.
- **Umfragen:** Stimmen bleiben nach Austritt aus dem Verein anonym gezählt – mit DSB klären, ob sie gelöscht werden müssen. Umfragen zu sensiblen Themen (Art. 9) ggf. in den Community-Richtlinien ausschließen. Mehrfachwahl und Ergebnis erst nach Ende sind bewusst nicht gebaut.
- Umfragen lassen sich nach dem Anlegen nicht ändern (auch ohne Stimmen); Bearbeiten betrifft nur Text/Tags. Bei Bedarf „Umfrage ändern, solange keine Stimmen“ nachrüsten.
- Öffentlicher Cache: Neue Termine, neue Beiträge und Logo-Wechsel erscheinen spätestens nach 60 s (bewusst nicht sofort geleert); Abschalten, Vereinsdaten, Ausblenden, Termin bearbeiten/absagen leeren sofort. Bilder unter `/public/media` können nach dem Abschalten bis zu 24 h im Browser-Cache bleiben.
- Vereinsfinder sucht per `ILIKE` ohne eigenen Index (SKALIERUNG: ab einigen tausend öffentlichen Vereinen Teilindex auf `public_page` bzw. Trigramm-Index für Name/Ort).
- Besucher-IP: Caddy setzt `X-Real-IP` per `header_up`, das Web reicht nur diesen weiter. In `infra/deploy/Caddyfile` (Produktion) steht global `trusted_proxies static private_ranges`: Kommt ein Client über den Docker-Userland-Proxy (z. B. IPv6) mit privater Bridge-IP an, würde Caddy dessen `X-Forwarded-For` glauben und `{client_ip}` wäre fälschbar. Vor dem Launch prüfen und die Zeile ggf. entfernen (nur nötig mit eigenem Load-Balancer davor). Caddyfiles lokal nicht validiert (kein Caddy/Docker) – beim nächsten Deploy `caddy validate` laufen lassen.
- Chat-Kandidaten laden für die Namenssuche alle Namen der aktiven Vereinsmitglieder (eine Abfrage) und filtern im Dienst. SKALIERUNG: bei sehr großen Vereinen (> 5.000 Mitglieder) Suche in `UsersDirectory` verlagern.

## Paket P4c Teil 2: offen (Stand 2026-11-08)
- **Beitragslauf an Minderjährige:** Rechnung geht an Name/Anschrift des Mitglieds; mit DSB/Steuerberatung klären, ob Erziehungsberechtigte Rechnungsempfänger sein müssen (Feld `guardianName` existiert, wird noch nicht genutzt).
- **Frist für `billing.fee_runs`** festlegen (Vorschlag: mit den Rechnungen); `created_by` bleibt nach Kontolöschung stehen (wie bei Rechnungen) – mit DSB klären.
- Beitragslauf rechnet je Lauf **einen** Betrag je Klasse (Betrag je Intervall); anteilige Beiträge (Eintritt im Jahr), Intervall-Umrechnung (z. B. 12 × monatlich) und Mehrfachpositionen sind nicht gebaut. Klassen mit 0 € erzeugen Entwürfe über 0 €.
- Finalisieren der Entwürfe eines Laufs geht nur einzeln; „Alle Entwürfe dieses Laufs finalisieren“ (Sammelaktion, ggf. als Job) nachrüsten. PDF weiter je Anfrage (kein Serien-PDF/Versand).
- Robustheit (umgesetzt): Versuchszähler am Lauf (ab 5 keine automatische Wiederholung), Lebenszeichen nach jedem 200er-Block, Sweep-Job `billing.fee-run-sweep` alle 5 Min. (queued > 1 Min., running ohne Lebenszeichen > 15 Min.), Knopf „Erneut versuchen“ bei fehlgeschlagenen Läufen. Offen: Entwürfe ausgetretener Mitglieder werden nicht automatisch entfernt (bewusst, Kassenwart entscheidet); ggf. Hinweis in der Rechnungsliste.
- 2000er-Grenze entfernt: `OrgsService.allActiveMembersWithRole` liest blockweise per Keyset (Primärschlüssel org_id, user_id) ohne Obergrenze; genutzt von Mitgliedsprofilen (`ensureProfiles`), Mitgliederliste, CSV-Export, Beitragslauf und `allActiveMemberIds` (Rechnungsempfänger, Namensliste für Vorstand/Moderation, Chat-Kandidaten). Vorher gingen dort Mitglieder ab Nr. 2001 still verloren. SKALIERUNG: Mitgliederliste und Export laden weiter alles in den Speicher und filtern dort (bei > 20.000 Mitgliedern Suche/Paging in die DB verlagern). Die Liste offener Rechnungen (`GET /orgs/:slug/invoices`, 500) und der Rechnungs-CSV-Export (5000/Jahr) haben weiter feste Grenzen.
- GiroCode: Name im SEPA-Zeichensatz (Latin-1 bleibt, anderes wird „?“); ohne abschließenden Zeilenumbruch nach dem Verwendungszweck (EPC069-12: nach dem letzten belegten Feld kein Trenner). Mit echten Banking-Apps (Sparkasse, VR, ING, DKB) testen.

## Paket P5 (Datenschutz-Lücken, Aufräum-Jobs, Mail): offen (Stand 2026-11-08)
- ~~Mailversand aktivieren~~ – erledigt in S2 (siehe unten).
- **Scaleway TEM (Paris/FR):** AVV abschließen, Unterauftragsverarbeiter-Liste, Datenschutzerklärung, Domain-Einträge SPF/DKIM/DMARC; Zugangsdaten nur als Server-Secret (`SMTP_USER`/`SMTP_PASS`), nie im Repo. Für Rechnungsmails muss der AVV mit dem Verein den Mail-Anbieter nennen.
- **Fristen mit DSB bestätigen:** Benachrichtigungen 180 Tage (früher Vorschlag 90), Zugriffsprotokoll 12 Monate / Moderation 24 Monate / Rechnungsaktionen 10 Jahre, Anwesenheit 24 Monate, gelöschte Beiträge 30 Tage (offene Meldung hält länger), abgelaufene/widerrufene Einladungen 30 Tage. Konstanten in `apps/api/src/privacy/retention.service.ts`.
- **Mail-Jobdaten in Redis:** Adresse und Link (Token) liegen bis zum Versand in der Queue-Redis (AOF-persistiert); nach Erfolg und nach dem letzten Fehlversuch werden sie sofort entfernt. Tokens für Passwort-Reset trotzdem kurz gültig halten (Vorschlag 30–60 Min.) und nur gehasht speichern.
- **Benachrichtigungen vor Migration 0021** haben keine `actor_id`; Name/Textauszug gelöschter Personen bleibt dort bis zur 180-Tage-Frist. Nur Kommentar-/Folgen-Benachrichtigungen tragen eine Akteur-ID; löscht jemand nur einen Kommentar (nicht das Konto), bleibt der Auszug in der Benachrichtigung des Beitragsautors bis zur Frist.
- **Datenauskunft:** Interessen-Tags je Nutzer gibt es noch nicht (bei `social.user_tags` in den Export aufnehmen). Der Export ist ein einziges JSON (SKALIERUNG: bei sehr aktiven Konten mit vielen tausend Nachrichten/Benachrichtigungen als Job mit Download-Link erzeugen). Rate-Limit: 5 Exporte bzw. 5 Bilder-ZIPs je Stunde und Konto.
- **Bilder-ZIP** enthält die größte gespeicherte Variante (WebP), nicht das Original (wird nie gespeichert) – in der Datenschutzerklärung so beschreiben.
- `created_by` an Rechnungen und Beitragsläufen bleibt nach Kontolöschung (Frage aus P4c Teil 2 weiter offen); `chat.conversations.created_by` ebenso prüfen.
- **DSA-Frage Kontolöschung:** Löscht jemand sein Konto, verschwinden seine Beiträge und Kommentare per Kaskade – samt **offener Meldungen** darüber (die Ausnahme „offene Meldung hält den Beitrag“ gilt nur für das eigene Löschen eines Beitrags und den 30-Tage-Job). Mit Anwalt/DSB klären, ob gemeldete Inhalte als Beweis (verschlüsselte Kopie, Frist) die Kontolöschung überstehen müssen (wie Chat-Meldungen, Art. 17 Abs. 3 lit. e DSGVO).
- Aufräumjob: schlägt ein Schritt fehl, laufen die anderen weiter; der Job meldet am Ende einen Fehler mit den Schrittnamen (BullMQ wiederholt ihn). Ein Monitoring-Alarm darauf fehlt noch.
- Anwesenheits-Export (CSV/PDF) für Vereine weiter offen (nicht Teil von P5).

## Paket S2 (Mail mit Scaleway + Kostenbremse): offen (Stand 2026-11-09)
- **Aktivieren auf dem Server:** `MAIL_DRIVER=smtp`, `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`MAIL_FROM` (optional `MAIL_REPLY_TO`, `MAIL_DAILY_LIMIT`, `MAIL_MONTHLY_LIMIT`) nur als Server-Secret in `/opt/vereine/.env`; `APP_URL` kommt aus `WEB_ORIGIN`. Vorher Scaleway-AVV, SPF/DKIM/DMARC, Datenschutzerklärung.
- **Kostenbremse nicht persistent:** Zähler liegen im Cache-Redis (allkeys-lru, ohne AOF). Ein Redis-Neustart setzt Tages-/Monatszähler zurück – das Monatslimit ist eine Bremse, keine harte Grenze. Zusätzlich im Scaleway-Konto ein Monatslimit/Budget-Alarm setzen. SKALIERUNG: bei mehreren API-Instanzen bleibt es korrekt (gemeinsames Redis), bei Redis-Cluster Keys prüfen.
- **Bounces/Beschwerden:** `SuppressionsService.recordBounce` ist vorbereitet, aber ohne Aufrufer – Scaleway-Webhook (signiert) anbinden, sonst landen harte Bounces nicht auf der Sperrliste.
- **Zurückgestellte Mails** (Kontingent voll): Einladungen/Rechnungen werden bis zu 3-mal auf den nächsten Morgen verschoben, Auth- und Sammelmails verworfen. Kein Hinweis an die auslösende Person – ggf. Anzeige im Vorstandsbereich.
- **Registrierung ohne Enumeration:** Restrisiko Pre-Account-Hijacking (fremde Adresse zuerst registriert) akzeptiert: das Konto ist erst nach Klick im Postfach nutzbar, erneute Registrierung einer unbestätigten Adresse speichert kein Passwort und ändert das Konto nicht, sondern schickt „Registrierung abschließen“ mit einem Passwort-festlegen-Link (Reset, 1 h); nach 7 Tagen ohne Bestätigung gelöscht. Verbleibend nur der klassische Fall „Angreifer registriert zuerst, Opfer klickt den ursprünglichen Bestätigungslink statt der neuesten Mail“ – dann hilft „Passwort vergessen“ (beendet alle Sitzungen). Optional: In der Bestätigungsmail darauf hinweisen, dass sie zu einer Registrierung zu einem bestimmten Zeitpunkt gehört. Das Passwort wird in allen Fällen gehasht (gleiche Antwortzeit), nicht gemessen.
- **Altkonten (vor S2)** haben keine bestätigte Adresse: Banner + Sperre für Verein gründen/Einladungen. Vor dem Launch entscheiden, ob sie eine Bestätigung erzwingen sollen (Demo-Konten haben `.invalid`-Adressen).
- **Rechtsfragen (DSB):** Sperrlisten-Fristen 12/36 Monate; Sammelmail als Einwilligung vs. Vertrag; Einladung per Mail an fremde Adresse (lit. f des Vereins, Hinweis in AVV/Nutzungsbedingungen); Rechnungsmail im Auftrag des Vereins.
- **Sammelmail:** läuft stündlich ab 07:00 (Berlin), höchstens einmal am Tag, nur Anzahlen; Likes nie. SKALIERUNG: Abfrage je Nutzer – bei vielen Tausend Abonnenten in Batches/Jobs aufteilen.
- **Weitere Mails später:** Termin-Erinnerungen, Austritt/Beitragsklasse – bewusst nicht in S2.
- **Secrets-Trennung (ARCHITEKTUR Punkt 5):** SMTP-Zugang liegt derzeit in `api` **und** `worker`, weil der Treiber beim Start die Konfiguration prüft; versendet wird nur im Worker. Später den Treiber in der API erst beim Versand anlegen und `SMTP_USER`/`SMTP_PASS` nur dem Worker geben.
