# Klubnest – Status, Skalierbarkeit, Launch-Infrastruktur, Wettbewerbsstrategie

Stand: 1. November 2026 · Autor: Bau-Assistent (Claude Code) · Alle Zahlen zu Preisen, Wettbewerbern und Lastannahmen sind **Schätzungen aus meinem Wissen** und vor Entscheidungen zu prüfen.

---

## 1. Kurzfazit

- **Technisch** steht ein solides, gut getestetes Fundament: Konten, Vereine, Rollen, Feed, Moderation, Termine, Chat, Profile mit Bildern, Plattform-Moderation, Sicherheitsbasis. Es läuft als Vorschau unter https://klubnest.de.
- **Für den ersten Launch fehlen** vor allem: E-Mail (Bestätigung/Passwort-Reset), echte Rechtstexte, automatisierte Backups + Monitoring, ein Onboarding-Weg für Vereine (Einladungen/Import), Handy-Tauglichkeit als App (PWA + Push) und – je nach Launch-Umfang – Spenden/Abrechnung und Mitgliederverwaltung.
- **Infrastruktur für 250 Vereine / 1.000 Nutzer** ist unkritisch: **ein 4-vCPU/8-GB-Server reicht** (Last <10 % ausgelastet). Der Engpass beim Launch ist nicht Technik, sondern **Vertrieb, Recht und Support**.
- **Wettbewerb:** Die echten Gegner sind WhatsApp-Gruppen, Spond und easyVerein-ähnliche Verwaltungstools, nicht „soziale Netzwerke“. Unser Vorteil kann **Datenschutz + Verein/Mitglied/Fan in einem + Spenden** sein – aber nur, wenn wir zuerst als **nützliches Werkzeug für Vereine** starten (Termine, Chat, Verwaltung), nicht als Netzwerk.

---

## 2. Was ist gebaut (Bestandsaufnahme)

**Umfang:** ~9.900 Zeilen Anwendungscode, ~2.700 Zeilen Tests, 132 automatische API-Tests, 19 Seiten, 9 Datenbank-Migrationen, 11 Commits. Läuft in 8 Containern auf einem Hetzner-Server (Nürnberg), HTTPS mit automatischem Zertifikat.

| Bereich | Stand | Reifegrad |
|---|---|---|
| Konto & Anmeldung | Registrierung, Login, Sitzungen, Passwort ändern, Geräteliste, Konto-Drosselung (Brute-Force), argon2id | gut; **fehlt:** E-Mail-Bestätigung, Passwort-Reset, 2FA/Passkeys |
| Datenschutz-Funktionen | Einwilligungen (nachweisbar), Datenexport, Konto löschen (inkl. Chat/Bilder) | gut |
| Vereine | gründen, suchen, folgen, Mitgliedsanträge, Rollen (Vorstand/Kassenwart/Moderation/Mitglied) | Basis; **fehlt:** Einladungslinks/Import, Mitgliederstammdaten |
| Feed | Beiträge, Bilder (bis 4), Likes, Kommentare, Melden; Ranking v2 (regelbasiert, mit Einwilligung), „Weniger davon“, „Warum sehe ich das?“ | gut; ML-Ranking später |
| Profile | wie Instagram: Avatar, @Name, Bio, Fotoraster, Follower/Folgt, private Profile, Personensuche | gut |
| Moderation | Vereins-Moderation mit Begründung (DSA), Plattform-Moderation (Meldungen ohne Verein, Chat-Meldungen), Zugriffsprotokoll | gut |
| Termine & Teams | Kalender, Sichtbarkeiten, Zu-/Absage, Erinnerungen, iCal | gut; **fehlt:** Kalender-Abo-Link, Wiederholungstermine |
| Chat | 1:1 & Gruppen, verschlüsselt gespeichert, Löschfristen, Blockieren, Melden, Echtzeit | gut; **fehlt:** Push, Anhänge, E2EE (optional) |
| Benachrichtigungen | In-App-Glocke (Polling) | Basis; **fehlt:** E-Mail, Web-Push |
| Spenden / Rechnungen / Verwaltung | Oberfläche mit Beispieldaten, nichts echt | **Konzept** |
| Betrieb | Docker-Setup, Redis, Worker, Health-Checks, Backups (Skript, Cron noch aus), Domain/HTTPS | Vorschau-Niveau |

**Qualitätsbasis:** Jede Etappe wurde mit API-Tests und Browser-Tests geprüft; Abhängigkeiten haben 0 bekannte Schwachstellen (Stand heute); strenge Sicherheits-Header; Chat-Schlüssel getrennt; Datenbank in Bereiche (identity/social/chat) geschnitten und per Test erzwungen.

**Lücken in der Absicherung (ehrlich):** kein End-to-End-Test der Oberfläche (nur manuell), kein Lasttest, keine Barrierefreiheitsprüfung, keine externe Sicherheitsprüfung, Backups nicht automatisiert, kein Monitoring/Alarm, Server läuft mit Testdaten und ohne Cloud-Firewall.

---

## 3. Skalierbarkeit

### 3.1 Wie sie gebaut ist
- **Modularer Monolith** mit klaren Bereichsgrenzen (eigene Datenbank-Schemas, eigener Chat-Container, Worker mit Warteschlange). Jeder Bereich kann später auf einen eigenen Server ziehen, ohne Fachcode zu ändern.
- **Feed:** Keyset-Paging, Indizes, begrenztes Ranking-Fenster (150 Beiträge/14 Tage) pro Anfrage.
- **Redis** für Sitzungs-Cache, Rate-Limits, Live-Zustellung; **zweites Redis** nur für Jobs (BullMQ).
- **Dateien** liegen aktuell auf dem Server (Docker-Volume) – austauschbar gegen S3/Object Storage.

### 3.2 Lastabschätzung (250 Vereine, 1.000 Nutzer)
Annahmen: 35 % täglich aktiv, 12 % gleichzeitig im Spitzenfenster (Abend), 40 Seitenaufrufe/Nutzer/Tag, 15 Chat-Nachrichten/aktivem Nutzer/Tag.

| Größe | Erwartung | Kapazität 1 Server (4 vCPU/8 GB) |
|---|---|---|
| Gleichzeitige Nutzer | ~120 | mehrere hundert |
| API-Anfragen Spitze | ~5–15 pro Sekunde | >300 pro Sekunde |
| WebSocket-Verbindungen | ~150 | ~2.000+ |
| Datenbank | <500 MB im 1. Jahr | Hunderte GB |
| Bilder | ~100/Tag × ~0,3 MB ≈ 10 GB/Jahr | Platte 80+ GB reicht; Umzug auf Object Storage empfohlen |
| CPU-Spitzen | Bild-Upload (sharp ~0,2–0,5 s je Foto) | unkritisch |

→ **Der Server wäre zu >90 % im Leerlauf.** Skalierung ist für 1.000 Nutzer kein Thema.

### 3.3 Wo es wann eng wird (Auslöser)
| Stufe | Nutzer (grobe Größenordnung) | Maßnahme |
|---|---|---|
| 0 | bis ~5.000 | 1 Server 8 GB, vertikal hochskalieren |
| 1 | ~5.000–25.000 | Datenbank auf eigenen Server (+Replikat), 2 App-Server hinter Load Balancer, Object Storage + CDN, Suche (Meilisearch) |
| 2 | ~25.000–100.000 | Chat-Server getrennt (inkl. eigener DB), Feed-Ranking-Fenster in Redis cachen/Fan-out-on-write, `messages` partitionieren, Monitoring Pflicht |
| 3 | >100.000 | Orchestrierung (Kubernetes/Nomad), Sharding-Strategie, eigene Such-/Empfehlungsdienste, ML-Ranking |

Technische Messgrößen für die Aufteilung stehen in `docs/ARCHITEKTUR.md` (CPU >70 %, RAM >80 %, DB-Verbindungen >70 %, >2.000 WebSockets, API p95 >400 ms).

### 3.4 Bekannte Schwachstellen (Risiko-Register)
| # | Risiko | Wirkung | Gegenmaßnahme | Wann |
|---|---|---|---|---|
| 1 | Ein Server = Single Point of Failure (Plattform, Dateien, DB) | Ausfall bis zur Wiederherstellung | Hetzner-Backups + Offsite + dokumentierte Wiederherstellung; später DB-Server + 2. App-Server | vor Launch (Backups), danach Stufe 1 |
| 2 | Kein Monitoring/Alarm | Ausfälle unbemerkt | Uptime-Check, Metriken (Prometheus/Grafana), Fehlertracking (GlitchTip), Alarm per Mail/Push | vor Launch |
| 3 | Backups manuell, Cron nicht installiert; Chat-Schlüssel nur auf dem Server | Datenverlust möglich | Cron + verschlüsselte Offsite-Kopie (Storage Box), Restore-Übung, Schlüssel im Passwortmanager | vor Launch |
| 4 | Ein Datenbanknutzer für alle Bereiche | Ein Fehler kann Bereichsgrenzen umgehen | Rollen je Schema | vor Stufe 1 |
| 5 | Kein E-Mail-Versand | Keine Verifizierung → Fake-/Spam-Konten, kein Passwort-Reset | Mailanbieter anbinden | **Launch-Blocker** |
| 6 | Keine Bot-Abwehr bei Registrierung | Spam-Konten | CAPTCHA-Alternative (z. B. ALTCHA, selbst gehostet) + E-Mail-Bestätigung | vor Launch |
| 7 | Medien auf lokaler Platte | Umzug/Skalierung erschwert | Object Storage | vor Stufe 1 |
| 8 | Deploy per Hand (`tar` + Docker-Build auf dem Server) | Fehleranfällig, kurzes Zeitfenster mit Ausfall, kein Rollback | CI/CD mit Images aus Registry, Blue/Green oder zumindest Rollback-Tag | vor/kurz nach Launch |
| 9 | Keine E2E-/Lasttests | Regressionen unbemerkt | Playwright-Tests, k6-Lasttest | vor Launch |
| 10 | Keine 2FA | Konto-Übernahme bei geleaktem Passwort | TOTP/Passkeys, Pflicht für Vorstände | kurz nach Launch |
| 11 | Plattform-Admin = 1 Person | Bus-Faktor | Zweitbesetzung, Prozess dokumentieren | Launch |

---

## 4. Infrastruktur bis 250 Vereine / 1.000 Nutzer

(Preise: Hetzner-Größenordnung, bitte aktuell prüfen; netto/Monat.)

### Variante A – „Schlank“ (empfohlen für Pilot und Launch)
| Baustein | Dimensionierung | ca. €/Monat |
|---|---|---|
| App-Server (alles in Containern) | 4 vCPU / 8 GB / 80 GB (Rescale des heutigen Servers) | 15–25 |
| Hetzner-Backups (Server-Snapshots) | +20 % | 3–5 |
| Offsite-Backups (Storage Box 1 TB, verschlüsselt) | Datenbank, Medien, Schlüssel-Kopie getrennt | 4 |
| Staging-Server (kleiner) | 2 vCPU / 4 GB | 4–6 |
| Object Storage (Medien, optional ab Start) | ~1 TB inkl. | ~6 |
| Cloud-Firewall, Private Network, Floating IP | | 0 |
| Domain + DNS | | ~1 |
| Mail (transaktional) | externer EU-Anbieter oder Hetzner-Postfach | 0–25 |
| Monitoring/Fehlertracking | selbst gehostet auf dem App-Server oder Mini-Server | 0–6 |
| **Summe** | | **≈ 35–70** |

### Variante B – „Robust“ (wenn ihr Ausfallsicherheit von Tag 1 wollt)
Load Balancer (~6) + 2 App-Server (2×~20) + Datenbank-Server 4 vCPU/16 GB mit Volume (~30) + Staging (~5) + Object Storage (~6) + Backups/Storage Box (~10) + kleiner Mailserver (~5) + Monitoring-Server (~5) ≈ **100–140 €/Monat**. Nutzen: ein Server darf ausfallen, DB getrennt. Für 1.000 Nutzer **nicht nötig**, aber ein guter Reife-Schritt ab etwa 3.000–5.000 Nutzern.

### Übersicht Betriebskosten außerhalb der Server (grobe Orientierung)
Rechtsberatung für AGB/Datenschutzerklärung/AVV: einmalig 2–6 k€ · externer Datenschutzbeauftragter: 50–300 €/Monat · Pentest vor Echtstart: 3–8 k€ · Cyber-/Haftpflichtversicherung: ~0,5–1,5 k€/Jahr · Zahlungsanbieter: Transaktionsgebühren (nur bei Spenden/Beiträgen) · Support/Community-Betreuung: Zeitaufwand.

→ **Server sind <1 % der Gesamtkosten.** Bei 250 Vereinen × 9–29 €/Monat (Hypothese) wären das 2.250–7.250 € Umsatz/Monat.

---

## 5. Was bis zum ersten Launch fehlt

**Empfohlene Zweiteilung:** (1) **Geschlossene Beta** mit 10–20 Pilotvereinen, (2) **öffentlicher Launch** Richtung 250 Vereine.

### Phase „Pilot-Reife“ (Beta mit 10–20 Vereinen)
| # | Paket | Größe* | Abhängigkeit |
|---|---|---|---|
| 1 | **E-Mail-Versand**: Bestätigung, Passwort-Reset, E-Mail-Benachrichtigungen (Termine, Anträge, Chat-Zusammenfassung) | M | **Mailanbieter-Entscheidung**, SPF/DKIM/DMARC |
| 2 | **Rechtstexte** echt (Datenschutz, Impressum, AGB/Nutzungsbedingungen, AVV für Vereine, DSA-Kontaktstelle) | extern | Anwalt/DSB, 2–6 Wochen |
| 3 | **Backups automatisiert + Restore-Übung + Offsite**, Monitoring/Alarme, Fehlertracking | M | Cron-Freigabe, Storage Box |
| 4 | **Onboarding für Vereine**: Einladungslinks/QR-Code, CSV-Import von Mitgliedern, Willkommens-Assistent, Muster-Inhalte | M | – |
| 5 | **PWA** (installierbar, Offline-Grundgerüst) + **Web-Push** für Chat/Termine | M | HTTPS vorhanden |
| 6 | **Sicherheit:** Bot-Abwehr bei Registrierung, 2FA (mind. für Vorstände), Cloud-Firewall, Pentest light | M | Firewall: Nutzer |
| 7 | **Qualität:** E2E-Tests (Playwright), Lasttest, Barrierefreiheit-Schnellcheck, CI/CD mit Rollback | M | – |
| 8 | **Staging-Umgebung** und Datenbank-Migrations-Prozess mit Backup-Zwang | S | kleiner Server |
| 9 | **Support-Prozess** (Kontakt, Hilfe-Center/FAQ, Meldestelle) | S–M | Zuständigkeit klären |
| 10 | **Server-Upgrade** auf 4 vCPU/8 GB, Testdaten bereinigen | S | Nutzer: Rescale |

### Phase „Öffentlicher Launch“ (Wachstum Richtung 250 Vereine)
| # | Paket | Größe* | Abhängigkeit |
|---|---|---|---|
| 11 | **Spenden** (Mollie/Stripe Connect), Zuwendungsbestätigungen | L | Zahlungsanbieter + KYC, ZAG-Prüfung |
| 12 | **Mitgliederverwaltung light**: Stammdaten, Beitragsklassen, Eintritt/Austritt, Mitgliederlisten-Export | L | AVV, Datenschutz-Prüfung |
| 13 | **Beitragsrechnung/SEPA/E-Rechnung/DATEV** | L | Zahlungsanbieter, Steuerberater-Abstimmung |
| 14 | **Abo-Abrechnung der Vereine** (Pläne, Rechnungen der UG/GmbH) | M–L | Preismodell |
| 15 | **Vereinsseite/Website-Baukasten light** (öffentliche Vereinsseite mit Terminen, Spenden-Button) | M | – |
| 16 | **Admin-/Support-Werkzeuge**: Nutzer-/Vereinssuche, Verifizierung, Statistiken | M | – |
| 17 | **Kalender-Abo, Wiederholungstermine, Umfragen/Abstimmungen, Helferlisten** | M | Wettbewerbsparität |

*Größe = grobe Bau-Einheit mit dem Bau-Assistenten: S ≈ 1 Etappe, M ≈ 2–3, L ≈ 4–8. Wartezeiten externer Schritte (Anwalt, Zahlungs-KYC, Marke) laufen parallel und sind der eigentliche Zeitfaktor.

**Realistische Richtwerte (bei Vollgas und zügigen Entscheidungen):** Pilot-Reife in ~6–10 Wochen · öffentlicher Launch mit Spenden/Verwaltung in ~4–6 Monaten. Rechts-/Zahlungsschritte sollten **sofort angestoßen** werden.

---

## 6. Wettbewerbsanalyse und Strategie

### 6.1 Der Markt (aus meinem Wissen – bitte Marktrecherche in Cowork ergänzen)
| Gegner | Stärke | Schwäche / Angriffspunkt |
|---|---|---|
| **WhatsApp-/Facebook-Gruppen** (der größte Wettbewerber) | gratis, jeder hat es, null Einstiegshürde | Datenschutz, Chaos, keine Struktur (Termine/Zusagen/Beiträge), Telefonnummern sichtbar |
| **Spond** (Team-/Vereins-App) | sehr einfach, Termine+Zusagen+Chat, hohe Verbreitung im Sport | Fokus Teams, kaum öffentliche Reichweite/Fans, kaum Verwaltung/Spenden-Tiefe, Datenschutz-Ängste bei US/Nordic-Anbietern |
| **easyVerein, Vereinsflieger, Campai u. ä.** | Mitgliederverwaltung, Beiträge, Buchhaltung | oft altbacken, wenig „Community“, Kommunikation schwach |
| **Nebenan.de, Facebook/Instagram** (lokal/öffentlich) | Reichweite | Werbemodell, kein Vereinswerkzeug, Datenschutz |
| **Heimspiel/SportEasy/TeamSnap** | spezialisiert Sport | Sportfokus, DE-Datenschutz/Spenden schwächer |

### 6.2 Unser Platz (Positionierung)
**„Die datenschutzfreundliche Vereins-Plattform aus Deutschland: Mitglieder organisieren, Fans erreichen, Spenden sammeln – alles an einem Ort, ohne Werbung.“**

Glaubwürdige Alleinstellungsmerkmale (nur mit Beweisen verkaufen):
1. **Datenschutz als Produkt:** Hosting DE, keine Tracker/Werbung, nachweisbare Einwilligungen, Löschfristen, verschlüsselte Speicherung, nachvollziehbarer Feed („Warum sehe ich das?“), DSA-Moderation mit Begründung.
2. **Dreiecksnetz Verein–Mitglied–Fan:** interne Werkzeuge **und** öffentliche Reichweite in einem (Spond/Verwaltungstools haben nur eines davon).
3. **Spenden mit automatischer Zuwendungsbestätigung** (sobald gebaut) – für viele Vereine ein echter Geldbringer.
4. **Faire, einfache Preise** + Gratis-Einstieg.

### 6.3 Die Gründerfalle: Netzwerk-Effekt
Soziale Netzwerke scheitern an leeren Feeds. **Strategie: Werkzeug zuerst, Netzwerk danach.** Ein Verein wechselt wegen *Termine + Zusagen + Chat + Mitglieder-Organisation* (ersetzt WhatsApp-Chaos); das Netzwerk (Fans, Entdecken) entsteht als Nebeneffekt. Messgröße: **Aktive Vereine mit wöchentlicher Nutzung**, nicht Registrierungen.

### 6.4 Fokus
Erst **1–2 Segmente und 1 Region** (z. B. Jugend-Sportvereine und Feuerwehren in einem Landkreis), dort Dichte aufbauen, Referenzen sammeln, dann ausrollen. Multiplikatoren: Trainer/Jugendwarte, Kreis-/Stadtsportbünde, Verbände, Ehrenamts-Agenturen, Sparkassen/Volksbank-Vereinsinitiativen, Kommunen.

### 6.5 Paritäts-Features, die Vereine erwarten (nach Priorität)
**P0 (Launch):** Termine+Zusagen ✓, Chat ✓, Push, Einladungen/Import, E-Mail-Benachrichtigung, Mitgliederliste.
**P1 (3 Monate nach Launch):** Spenden+Bescheinigung, Beitragseinzug/SEPA, Umfragen/Abstimmungen, Helfer-/Dienstpläne, Dokumentenablage, Kalender-Abo.
**P2 (6–12 Monate):** Rechnungen/E-Rechnung/DATEV, Vereinsseite/Website, Mannschaftsaufstellung/Fahrgemeinschaften, Newsletter, native Apps, ML-Empfehlungen, Marktplatz/Sponsoren.

### 6.5b Plattform-Strategie zur Geschwindigkeit
Verwaltung ist ein großes, regulatorisch schweres Feld. Zwei Wege: **selbst bauen** (volle Kontrolle, 3–6 Monate) oder **Integration/Partnerschaft** mit einem bestehenden Verwaltungstool (schneller, weniger Alleinstellung). Empfehlung: **zuerst Mitglieder-Light selbst bauen**, SEPA/Rechnungen erst nach Pilot-Feedback.

### 6.6 Erlösmodell – Hypothesen zum Testen (noch nicht entschieden)
| Plan | Zielgruppe | Hypothese |
|---|---|---|
| Gratis | Kleinvereine bis ~30 Mitglieder | Werkzeuge + Netzwerk, Plattform-Branding |
| Verein | bis ~200 Mitglieder | ca. 9–19 €/Monat: Verwaltungsfunktionen, Push/E-Mail, eigene Vereinsseite |
| Verein Plus | große Vereine | ca. 29–79 €/Monat: Beitragseinzug, Rechnungen, mehrere Teams, API |
| Spendenabwicklung | alle | Plattformgebühr 0–1,5 % zzgl. Zahlungsanbieter |
Alternative: Ehrenamts-freundlich gratis + Spenden-Gebühr als Hauptumsatz. **Preis-Interviews mit 10–15 Vereinen vor Festlegung.**

---

## 7. Empfohlener Fahrplan (Entscheidungsvorschlag)

**Jetzt (parallel starten, Wartezeit):** Rescale auf 4 vCPU/8 GB · Hetzner-Cloud-Firewall · Backup-Cron freigeben · Mailanbieter wählen · Zahlungsanbieter wählen (KYC startet früh) · Anwalt/DSB beauftragen (AGB, Datenschutz, AVV, DSFA) · Marken-/Namensprüfung „Klubnest“ · 10–15 Vereins-Interviews (Probleme, Zahlungsbereitschaft).
**Bau-Etappen 1–3 (Pilot-Reife):** Mail + Verifizierung + Passwort-Reset → Monitoring/Backups/CI-CD/Staging/E2E → PWA + Push + E-Mail-Benachrichtigungen + Vereins-Onboarding (Einladungen/Import).
**Beta:** 10–20 Pilotvereine in einer Region, wöchentliche Gespräche, Messgrößen definieren.
**Bau-Etappen 4–6 (Launch):** Spenden → Mitglieder-Light → Abo-Abrechnung + Vereinsseite.
**Danach:** Beitragseinzug/Rechnungen, Umfragen/Helferpläne, Kalender-Abo; später ML-Ranking, native Apps.

---

## 8. Offene Entscheidungen (beim Eigentümer)
1. Mailanbieter · 2. Zahlungsanbieter (+ KYC) · 3. Preismodell · 4. Zielsegment/Region für die Pilotphase · 5. Launch-Umfang (Beta ohne Spenden ok?) · 6. Wer ist Plattform-Moderator (Name/E-Mail) · 7. Server-Rescale, Firewall, Backup-Cron, Webhosting-Paket prüfen · 8. Rechtsberatung beauftragen · 9. Markenschutz/Name final · 10. Support-Ressourcen.

Weitere technische Aufgaben und Blocker: `docs/OFFENE-PUNKTE.md`. Architekturdetails: `docs/ARCHITEKTUR.md`.
