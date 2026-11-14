# Plan vor der Firmengründung (Klubnest / Vereine 2.0)

Stand: 2026-11-13. Grundlage: gesamtes Repo (CLAUDE.md, docs/*, Code-Stichproben) und der Marketing-Ordner (`Desktop\Vereine Marketing`). Keine Rechtsberatung; Rechts- und Steuerpunkte sind Fragen an Anwalt, DSB und Steuerberatung.

## 0. Beschluss 2026-11-13: Linie „A+“ (ersetzt die Bau-Reihenfolge in Abschnitt 3 und 6)
Nach Welle 0 (Claim-Audit: 30 von 99 Marketing-Aussagen falsch, Red-Team, Fragenliste, Zahlungsanbieter) gilt:
1. **Marketing ehrlich auf den Ist-Stand ziehen** (Korrekturliste: `docs/welle0/CLAIM-AUDIT.md`). Spenden, Lastschrift, native Apps nur als „geplant“.
2. **Bau eingefroren auf:** T1.1 CSV-Import, T1.2 Warteliste, T1.3 AVV-Akzeptanz, T4 Backups/Restore (Skripte, Ausführung nur mit Nutzer-Ja). **Gestoppt bis Gate:** S3, S4, T3 Spenden/SEPA (Welle 5 gestrichen), T2.9/T2.10.
3. **Interviews zuerst:** 10–15 Vorstandsgespräche mit Preis-Test, KSB-Gespräch, Wechselgrund gegen Spond/WhatsApp klären.
4. **Gate zum Weiterbauen:** ≥ 10 Interviews, ≥ 3 Absichtserklärungen (LOI), ≥ 1 Verein nennt einen Preis. Gründungs-Gate (Abschnitt 8) wird um LOIs, Interviews und Support-Kapazität ergänzt.
5. **Rechtsfragen parallel:** Anwalt/DSB ab Woche 1 (`docs/recht/FRAGENLISTE-ANWALT-DSB.md`), besonders Minderjährige und Zahlungsmodell (ZAG).
6. **Sofort:** Einladungslink-Verhalten (tritt direkt bei, ohne Freigabe) im Marketing richtigstellen; optional Einstellung „Beitritt über Link nur mit Freigabe“ später.
7. Agenten: ein Prüfer je Paket plus eigene Testläufe des Sessionleiters; Doku-Einträge schreibt der Sessionleiter zentral am Wellenende.

## 1. Das Produkt in einem Absatz

Klubnest ist eine DSGVO-orientierte Vereins-Plattform aus Deutschland (Hetzner DE, nur EU-Anbieter, kein Tracking). Sie verbindet **Verwaltung** (Mitglieder, Beitragsklassen, Beitragslauf, Rechnungen mit GiroCode), **Kommunikation** (Termine mit Zu-/Absage, Warteliste, Helfer, Chat, Feed, Profile) und **Reichweite** (öffentliche Vereinsseite, Vereinsfinder). B2B2C: Vereine zahlen, Mitglieder und Fans nutzen. Strategie: **Werkzeug zuerst, Netzwerk danach**; Start im Landkreis Leipzig mit Sportvereinen; Nordstern-Kennzahl sind wöchentlich aktive Vereine. Marketing ist fertig vorbereitet (Strategie, Marke, ~85 Social-Bilder, Vertriebsfolien, Flyer, Mailvorlagen).

## 2. Wichtigster Befund: Marketing und Produkt laufen auseinander

`00_START-HIER.md` legt fest: „Zum Start sind alle Funktionen live, auch Spenden, E-Mail und Lastschrift.“ Der Code-Stand (Commit 04458f1, 24 Migrationen) sagt:

| Marketing behauptet | Realität im Repo | Folge |
|---|---|---|
| Spenden mit Zuwendungsbestätigung | Seite `/spenden` ist nur „Kommt später“; kein Anbieter, kein Datenmodell | Säule 3 der Botschaft trägt nicht. UWG-Risiko (irreführende Werbung), wenn beworben |
| Lastschrift / Beitragseinzug | nur GiroCode (QR zum Überweisen); keine SEPA-Mandate | Aussagen in Vorstands-Folien, Mails, Onboarding Tag 7 falsch |
| Apps (iOS/Android), Store-Bilder | nur PWA (manifest, sw.js); keine Capacitor-Hülle, keine Entwicklerkonten | Store-Bilder sind verfrüht |
| E-Mail | S2 gebaut und mit `MAIL_DRIVER=smtp` live; Bounce-Webhook fehlt | passt weitgehend |
| Warteliste mit Double-Opt-in (Phase 0) | nicht gebaut (steht in S5) | Phase 0 der Marketingstrategie kann nicht starten |
| Mitglieder-Import (Einwand „importieren“) | nur Export; CSV-Import fehlt | größter Hebel für Pilotvereine fehlt |
| „Zusagen per Link auch ohne Konto“ (Einwandbehandlung) | im Code nicht gefunden | prüfen, sonst streichen |
| Echte App-Screens | alle Marketing-Screens sind nachgebaut (SV Grünwald 1921 …) | gewollt und ehrlich benannt; echter Demo-Verein fehlt |
| „DSGVO-konform“ | Datenschutzerklärung, Impressum, AGB sind Platzhalter; AVV, VVT, DSFA, TOMs fehlen | Formulierung erst nach Anwalt/DSB |

**Entscheidung nötig (A oder B), bevor irgendetwas veröffentlicht wird:**
- **A: Marketing an den Ist-Stand anpassen** (Spenden und Lastschrift als „kommt“, Apps als „App-Gefühl im Browser, installierbar“). Schnell, sauber, sofort startklar.
- **B: Produkt an das Marketing anpassen** (Spenden + SEPA + Apps bauen, 4–6 Monate laut STATUS-ANALYSE, plus KYC beim Zahlungsanbieter, das die Firma braucht).
- **Empfehlung:** A für den Start (Beta mit 10–20 Pilotvereinen), B als Roadmap. Die Spenden-Technik (Datenmodell, Anbieter-Schnittstelle, Testanbieter, Zuwendungsbestätigung als PDF) lässt sich vor der Gründung bauen, scharfschalten geht erst mit Firma und KYC.

## 3. Was vor der Gründung ohne Firma möglich ist

### 3.1 Technik (Claude Code, ohne Nutzer-Freigabe außer Deploy)
**Block T1 – Pilot-Reife (höchster Nutzen)**
1. **Mitglieder-Import per CSV** mit Vorschau, Fehlerzeilen, Einladungsmails (Mail-Kostenbremse beachten). Ohne Konto-Anlage ohne Zustimmung: Import erzeugt Einladungen, keine Konten.
2. **Vorab-Anmeldung/Warteliste** auf der Startseite: Double-Opt-in-Mail, Tags (vorstand, kasse, trainer, mitglied, fan, multiplikator, Region), `?q=flyer`/Aktionscode, Abmeldelink, Löschfrist. Eigene Tabelle, Datenschutz-Eintrag.
3. **AVV-Akzeptanz im Vereins-Onboarding** (digital, versioniert, nachweisbar) – Pflicht, weil Klubnest bei Mitgliederdaten Auftragsverarbeiter ist; Text liefert später der Anwalt, Mechanik jetzt.
4. **Mindestalter/Jugendvereine:** Lösung festlegen und bauen (Elternkonto oder Mitglied ohne eigenes Konto nur mit Stammdaten). Blockiert Jugendvereine, also die Hauptzielgruppe.
5. **Altkonten-Entscheidung** (E-Mail-Bestätigung erzwingen?) und Bounce-Webhook (Scaleway) anbinden; SMTP-Zugang nur an den Worker; fehlgeschlagenen Job aus `/health/ready` klären.
6. **Support-Basis:** Kontaktformular/Hilfeseite/FAQ, DSA-Kontaktstelle, Meldeweg; Plattform-Werkzeug „Vorstand setzen“.

**Block T2 – Wirkung und Gefühl**
7. **S3 Aktivität** (gebündelte Likes, Antworten, @Erwähnungen, Live-Pop-ups über den vorhandenen WebSocket, Seite `/aktivitaet`).
8. **S4a iOS-Fundament** (Tokens, LargeTitleHeader, ListGroup, TabBar, ActionSheet, Seitenübergänge) und **S4b** Seiten umstellen; axe in Hell/Dunkel grün halten.
9. **Demo-Verein mit schönen, erfundenen Daten** (nur Eigenmaterial, keine echten Personenfotos), damit echte Screenshots und Screenrecordings für TikTok/Reels entstehen. Alte Demo-Daten mit echten Fotos zuerst löschen (`infra/demo/README.md`).
10. **OG-Bilder** je Verein/Beitrag, `trusted_proxies` in der Caddyfile prüfen, `caddy validate` beim nächsten Deploy.

**Block T3 – Geld-Vorbereitung (nur bis Testmodus)**
11. **Spenden-Grundgerüst:** Schema `billing`, Anbieter-Schnittstelle, Testanbieter, Zuwendungsbestätigung (PDF nach amtlichem Muster, Aussteller = Verein), Spendenseite, Export/Löschregeln, Datenschutz-Eintrag. Anbieter nur EU (Mollie NL ist der Kandidat; Stripe passt nicht zur Vorgabe „kein US-Anbieter“, das zählt zur Entscheidung des Nutzers).
12. **SEPA-Lastschrift-Datenmodell** (Mandat, Gläubiger-ID, Vorabankündigung) und Anbindung über denselben Anbieter. Erst nach A/B-Entscheidung.
13. **Abo-Abrechnung Plattform → Verein** (Pläne, Rechnungen der UG/GmbH). Erst nach den Preis-Interviews.

**Block T4 – Betrieb und Sicherheit (Pflicht vor echten Nutzern)**
14. **Backups:** Cron, verschlüsselte Offsite-Kopie (Storage Box), **Restore-Übung** mit Protokoll, Schlüssel (`CHAT_MASTER_KEYS`, `AUTH_SECRET_KEY`) im Passwortmanager sichern. Freigabe vom Nutzer nötig.
15. **Monitoring/Alarm:** Prometheus/Grafana oder leichter, Warnung bei fehlgeschlagenen Jobs, Mail-Kontingent, Platte > 80 %, Uptime-Check.
16. **Staging und Deploy mit Rollback** (Images statt `tar`, Rollback-Tag), Migration nur mit Backup.
17. **Sicherheit:** 2FA-Pflicht für Vorstände und Plattform-Admins, Passkeys, CSP mit Nonces, Bot-Abwehr bei Registrierung (ALTCHA, selbst gehostet), ClamAV bei Anhängen, DB-Rollen je Bereich, Row-Level-Security vor weiteren Verwaltungsmodulen, Dependabot, Pentest (extern, braucht Budget).
18. **Qualität:** k6-Lasttest auf Staging, E2E für 2FA/Kontolöschung/Moderation/Beitragslauf, manuelle Barrierefreiheit (Screenreader, Tastatur), BFSG-Check.
19. **Löschjobs offen:** finalisierte Rechnungen gelöschter Vereine nach Fristende, Benachrichtigungen ohne `actor_id`, Outbox für Austritts-Aufräumen.

### 3.2 Rechtliche Vorbereitung (Claude liefert Entwürfe/Checklisten, Anwalt/DSB entscheiden)
- Entwürfe als Arbeitsgrundlage für den Anwalt: VVT (aus `DATENSCHUTZ-LAUNCH.md` Abschnitt 2), TOM-Dokument, Löschkonzept (Fristen-Tabelle), DSFA-Gerüst (Feed-Profiling, Chat, Minderjährige), AVV-Vorlage für Vereine, Unterauftragsverarbeiter-Liste (Hetzner DE, Scaleway FR, später Zahlungsanbieter), Datenpannen-Prozess (72 h), Community-Richtlinien, DSA-Verfahren.
- **Gebündelte Fragenliste an Anwalt/DSB** aus `OFFENE-PUNKTE.md` (ca. 20 Punkte: Fristen, Minderjährige, Beweiskopie bei Kommentaren, Art. 26 vs. AVV bei öffentlichen Vereinsseiten, Zusagen-Anzeige, Sammelmail-Rechtsgrundlage, Kaltakquise …). Das spart Anwaltsstunden.
- Marken-/Namensrecherche „Klubnest“ (DPMA, EUIPO, Klassen 9, 38, 42) als Selbstrecherche vorbereiten; die Anmeldung braucht den Inhaber (idealerweise die Firma).
- Impressum, Datenschutzerklärung, AGB: Texte erst nach Firmendaten; Seiten und Verlinkung sind schon da.

### 3.3 Marketing (ohne Firma machbar, ohne Falschaussagen)
- Marketing-Überarbeitung nach Entscheidung A: alle Texte, Folien, Flyer, Mails auf den Ist-Stand ziehen (Skill `klubnest-leitplanken` ist dafür gedacht).
- 10–15 Vorstands-Interviews (Leitfaden liegt vor) mit Preis-Test nach Van Westendorp; Auswertungstabelle. Kein Firmenstatus nötig.
- Plattform-Handles sichern (@klubnest) und Profile anlegen; „Build in Public“ mit Gründerperson ist ohne Firma möglich, aber Impressumspflicht prüfen, sobald die Profile geschäftsmäßig sind (ggf. erst nach Gründung veröffentlichen).
- Kreissportbund Landkreis Leipzig kontaktieren (erst anrufen), Pilotvereine als **Absichtserklärung (LOI)**, nicht als Vertrag.
- Platzhalter füllen (Nachname, Telefon, E-Mail, Pilot-Konditionen, Infoabend), Gründergeschichte mit echten Erlebnissen.
- Kaltakquise per E-Mail an Vereine nur mit vorheriger Einwilligung (§ 7 UWG): erst Telefon/persönlich.

## 4. Was erst mit der Firma geht (Gründungs-Gate)
Gründung selbst ist Nutzer-Aufgabe (Rechtsform UG vs. GmbH, Gesellschaftsvertrag, Notar, Geschäftskonto, Handelsregister, Gewerbeanmeldung, Finanzamt/USt-ID, Gründer-Steuerberatung). Danach, in dieser Reihenfolge:
1. Impressum, Datenschutzerklärung, AGB, AVV mit echten Firmendaten live; Hetzner- und Scaleway-AVV im Firmennamen.
2. Zahlungsanbieter-Konto und KYC (Vorlauf 1–3 Wochen), Spenden/Lastschrift scharf.
3. Marke anmelden (Inhaber = Firma).
4. Apple- und Google-Entwicklerkonten (Organisation, braucht Firmennachweis/D-U-N-S) für eine Capacitor-Hülle.
5. Versicherungen (Cyber, Betriebshaftpflicht), DSB benennen, Support-Postfach.
6. Preise festlegen (nach Interviews), Abo-Abrechnung, Pilot-Verträge statt LOI.
7. `NEXT_PUBLIC_ALLOW_INDEXING=1` erst danach, plus Datenschutzerklärung für Besucher ohne Konto.

## 5. Nutzer-Aufgaben (Claude kann sie nicht erledigen)
| Aufgabe | Dringlichkeit |
|---|---|
| Entscheidung A/B (Abschnitt 2) | sofort |
| Rechtsform und Gründungstermin; Anwalt und DSB beauftragen (Vorlauf 2–6 Wochen) | sofort |
| Hetzner-Cloud-Firewall (22 nur eigene IP) | vor echten Nutzern |
| Freigabe Backup-Cron, Storage Box, Server-Rescale (4 vCPU/8 GB) | vor Beta |
| Scaleway-Budgetlimit setzen | sofort |
| Zahlungsanbieter wählen (EU) | vor Gründung entscheiden, nach Gründung KYC |
| Interviews führen, KSB anrufen | parallel ab jetzt |
| Plattform-Moderator und Support-Person benennen (Bus-Faktor) | vor Beta |
| Schutz vor dem Server (EU-WAF/CDN: Bunny.net, Myra, Gcore, oder nur Hetzner-DDoS + Caddy-Limits) | vor Launch |
| Preis- und Pilotkonditionen | nach Interviews |

## 6. Reihenfolge und Zeitrahmen (Richtwerte)
- **Woche 1:** Entscheidung A/B, Anwalt/DSB beauftragen, Marketing-Wahrheitsabgleich, T4-Freigaben, Interviews beginnen, T1 (Import, Warteliste, AVV-Akzeptanz).
- **Woche 2–3:** T1 fertig, S3, Demo-Verein, Support-Basis, Backups + Restore-Übung, Monitoring; Rechtsentwürfe an Anwalt.
- **Woche 3–5:** S4a/b, Sicherheit (2FA-Pflicht, Bot-Abwehr, CSP), Staging/Rollback, Lasttest, Minderjährigen-Lösung; Marketing nach Wahrheitsabgleich freigeben.
- **Woche 4–6:** Spenden-Gerüst bis Testmodus; Gründung; Gründungs-Gate abarbeiten.
- **Danach:** Beta mit 10–20 Pilotvereinen, dann öffentlicher Launch.

## 7. Risiken
1. Falschaussagen im Marketing (UWG, „DSGVO-konform“, „Lastschrift“, „Apps“). Gegenmittel: Wahrheitsabgleich als fester Gate-Schritt vor jeder Veröffentlichung.
2. Jugendvereine ohne Mindestalter-Lösung. Gegenmittel: T1.4 priorisieren.
3. Rechtstexte als Engpass (Wartezeit extern). Gegenmittel: früh beauftragen, Entwürfe vorbereiten.
4. Zahlungs-KYC verzögert Spenden. Gegenmittel: Konto direkt nach Gründung; Beta ohne Spenden.
5. Ein einziger Server, Backups manuell, Schlüssel nur auf dem Server. Gegenmittel: T4.
6. Bus-Faktor: eine Person für Technik, Moderation, Support. Gegenmittel: Zweitbesetzung, dokumentierte Abläufe.
7. Nutzer-Wochenlimit bei Claude Code ist knapp: Pakete klein halten (je Paket ein Umsetzer, ein Prüfer).

## 8. Definition „bereit zur Gründung“
Entscheidung A/B getroffen · Anwalt und DSB beauftragt · Marketing mit Ist-Stand abgeglichen · Interviews begonnen (≥ 5) · Demo-Daten mit echten Fotos gelöscht · T1.1–T1.3 live · Backups mit erfolgreicher Restore-Übung · Marken-Vorrecherche gemacht · Zahlungsanbieter gewählt.
