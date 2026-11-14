# A1: Rechtstexte, Hilfe und Kontaktseiten (Annahmen und offene Rechtsfragen)

Stand: 14. November 2026. Alle Texte sind vollständig geschrieben, aber **nicht anwaltlich oder durch eine:n Datenschutzbeauftragte:n geprüft**. Öffentliche Seiten tragen bewusst keinen Hinweis darauf und behaupten nichts wie „geprüft“ oder „DSGVO-konform“ („nach den Grundsätzen der DSGVO entwickelt“). Dieses Dokument ist die Prüfliste für den Gründer; nichts davon steht in den Sammel-Dokumenten (`DATENSCHUTZ-LAUNCH.md`, `OFFENE-PUNKTE.md`), bitte vom Hauptstrang übernehmen.

## 1. Was gebaut wurde

| Bereich | Datei |
|---|---|
| Firmendaten zentral (Umgebungsvariablen, Platzhalter-Rückfall) | `apps/web/lib/legal-config.ts`, Pflicht-Build-Warnung `apps/web/scripts/check-legal.mjs` (läuft vor `next build`, `LEGAL_STRICT=1` bricht ab) |
| Seiten (öffentlich, ohne Login, in Sitemap und Fußzeile) | `/datenschutz`, `/impressum`, `/agb` (Nutzungsbedingungen), `/community-richtlinien`, `/meldeverfahren` (DSA), `/barrierefreiheit`, `/hilfe`, `/kontakt` |
| Bausteine | `apps/web/components/legal-doc.tsx` (Inhaltsverzeichnis, Tabellen als Karten am Handy, aufklappbare FAQ) |
| AVV-Text | `packages/shared/src/avv.ts`, Version `2026-11-14-entwurf-2` (Status weiter `draft`, alte Fassung behalten, Hash im Test festgehalten) |
| Betriebsdokumente | `docs/TOM.md`, `docs/VVT.md`, `docs/LOESCHKONZEPT.md`, `docs/DATENPANNE-PROZESS.md` |
| Auslieferung | `infra/docker/web.Dockerfile` und `infra/deploy/docker-compose.preview.yml` reichen `NEXT_PUBLIC_LEGAL_*` und `NEXT_PUBLIC_ALLOW_INDEXING` als Build-Argumente durch (vorher kamen sie gar nicht im Build an) |
| `LEGAL_VERSION` | von `2026-10-29` auf `2026-11-14` angehoben (wird nur beim Speichern neuer Zustimmungen verwendet, keine Erzwingung erneuter Zustimmung) |

## 2. Vor dem Launch zwingend erledigen

1. **Firmendaten eintragen** (Build-Umgebung, z. B. `.env.preview` bzw. Shell beim `docker compose build`): `NEXT_PUBLIC_LEGAL_COMPANY, _FORM, _STREET, _POSTAL_CITY, _REPRESENTATIVES, _REGISTER, _VAT_ID, _EMAIL, _PHONE, _DPO, _AUTHORITY` (optional `_COUNTRY`, `_DSA_EMAIL`). Für Telefon und USt-IdNr. bei „nicht vorhanden“ den Wert `-` setzen. Web **neu bauen** (Werte werden beim Build eingebettet). Mit `NEXT_PUBLIC_ALLOW_INDEXING=1` warnt der Build bei fehlenden Werten (`LEGAL_STRICT=1` bricht ihn ab).
2. **E-Mail-Postfächer einrichten** für allgemeine Anfragen, Datenschutz und `dsaEmail` (kann dieselbe Adresse sein) und sicherstellen, dass sie gelesen werden. Die Seiten versprechen „so schnell wie möglich“, bei Barrierefreiheit „in der Regel innerhalb von zwei Wochen“, bei Betroffenenrechten die gesetzliche Monatsfrist.
3. **Zuständige Aufsichtsbehörde** nach Firmensitz eintragen (`_AUTHORITY`). Datenschutz-Kontakt/DSB: ab 20 Personen mit ständiger Datenverarbeitung ist ein DSB Pflicht (§ 38 BDSG); ob für die Gründung nötig, klärt der Anwalt. Bis dahin „Datenschutzkontakt“ statt „Datenschutzbeauftragter“ nennen.
4. **AVV mit Hetzner und Scaleway abschließen** und ablegen. Die Datenschutzerklärung sagt, dass sie bestehen „oder vor Aufnahme der jeweiligen Verarbeitung abgeschlossen“ werden; vor Echtbetrieb (besonders E-Mail-Versand, `MAIL_DRIVER=smtp`) muss das stimmen. SPF/DKIM/DMARC einrichten.
5. **Betriebsrealität an die Texte anpassen** (sonst sind die Aussagen falsch):
   - **Backups:** Skript vorhanden, aber **kein Cron/Timer, keine Offsite-Kopie**. AGB/Datenschutz/AVV nennen „Sicherungen“ und „bis zu 14 Tage“. Automatischen täglichen Lauf einrichten (`KEEP=14`).
   - **Server-Logs:** Docker rotiert nach Größe (10 MB × 3), nicht nach Tagen. Text sagt „in der Regel höchstens 14 Tage“. Bei vielen Zugriffen ggf. kürzer, bei wenigen länger. Caddy-Log-Format/Rotation prüfen (IP-Kürzung offen).
   - **Wartelisteneinträge:** Text sagt „spätestens sechs Monate nach dem Start“. Löschjob für bestätigte Einträge fehlt noch (`OFFENE-PUNKTE.md`).
   - **Rechnungen gelöschter Vereine:** AVV sagt, sie werden nach Fristablauf gelöscht; Löschjob fehlt.
6. **Demo-Daten löschen** (echte Personenfotos, Kinder erkennbar) vor dem Start mit echten Nutzern.
7. **`AVV_REQUIRED=true`** erst setzen, wenn der AVV-Text freigegeben ist.
8. Anwalt/DSB: alle Texte prüfen und `status: "final"` mit neuer Version im AVV setzen (Hash im Test ergänzen, alte Fassungen behalten).

## 3. Annahmen im Text, die der Gründer bestätigen sollte

**Datenschutz**
- **Push und Drittland:** Der Auftrag lautete „Drittland: keine“. Der Text sagt das für alle Verarbeitungen des Betreibers (Server DE, Mail FR), nennt aber ehrlich, dass die **Push-Dienste der Browserhersteller (Google, Apple, Microsoft, Mozilla)** eigene Verantwortliche sind, deren Sitz in einem Drittland liegen kann; Grundlage Einwilligung (Art. 6 Abs. 1 lit. a, Art. 49 Abs. 1 lit. a). Alternative: Push erst nach Rechtsberatung aktivieren.
- **Rechtsgrundlagen** je Verarbeitung nach Faktenbasis; offene Zweifel bleiben (siehe `OFFENE-PUNKTE.md`): Zusagen-Anzeige (b/f), Anwesenheit (b/f), öffentliche Vereinsseite (f des Vereins), Einladungsmail an fremde Adressen (f des Vereins; zusätzlich ePrivacy/§ 7 UWG bei Nicht-Mitgliedern), Sammelmail (Einwilligung).
- **Rollenverteilung:** Plattform = Verantwortlicher für Konto, Profile, Feed, Chat, Push, Warteliste, Besuch; Verein = Verantwortlicher für Mitgliederverwaltung (wir Auftragsverarbeiter). Für öffentliche Vereinsseite, Termine, Zusagen und Helferlisten steht nur „Verein inhaltlich verantwortlich, wir stellen die Plattform bereit“. **Ob Art. 26 (gemeinsame Verantwortung) nötig ist, bleibt offen.**
- **Fristen** sind die Vorschläge/Konstanten aus dem Code (Benachrichtigungen 180 Tage, Anwesenheit 24 Monate, Protokoll 12/24 Monate/10 Jahre, Sperrliste 12/36 Monate, Chat 365 Tage …), nicht durch DSB bestätigt.
- **Mindestalter 16** wie bei der Registrierung; Aussage, dass jüngere Konten ohne Zustimmung der Eltern gelöscht werden, ist eine Betriebszusage. Das Konfliktthema Jugendvereine (Mitglieder unter 16, Art. 8 DSGVO, JMStV) ist **nicht gelöst**, nur allgemein benannt.
- **Datenübertragbarkeit/Auskunft** als Selbstbedienung (5 Exporte/h) – beschrieben wie umgesetzt.
- Nicht erwähnt, weil nicht gebaut: Analytics, Cookies außer `sid`, Spenden/Zahlungsanbieter.

**Nutzungsbedingungen**
- **Entgelt:** „Die Nutzung ist derzeit kostenlos.“ Bei künftigem Preismodell Bedingungen, Widerrufsbelehrung (Fernabsatz) und Preisangaben ergänzen.
- **Haftung** nach üblichem Muster (§ 309 Nr. 7 BGB-konform), Kündigung durch den Betreiber mit 30 Tagen, Änderungsklausel mit 30 Tagen Frist und Widerspruch/Fortnutzung als Zustimmung (Wirksamkeit der Zustimmungsfiktion ist umstritten, **Anwalt prüfen**; BGH-Rechtsprechung zu AGB-Änderungen).
- **Verbraucherstreitbeilegung:** Text sagt „weder bereit noch verpflichtet“ (§ 36 VSBG). Gründerentscheidung bestätigen.
- Gerichtsstand nur für Kaufleute/Unternehmer.
- **Rechnungen:** nur „Rechnungen als PDF“ beschrieben; Spenden und Zahlungen sind nirgends erwähnt (auftragsgemäß). Das Hilfe-FAQ nennt „Rechnungen als CSV“ (Export).
- Verantwortung der Vereine (AVV, Information der Mitglieder, Bildrechte, Import nur eigener Mitglieder) ist ausformuliert; **Vereine als Unternehmer oder Verbraucher** ist nicht entschieden (Text bleibt neutral).

**DSA / Meldeverfahren**
- Als kleiner Anbieter greifen Art. 16 ff. DSA (Online-Plattform) möglicherweise nicht in vollem Umfang (Befreiung für Kleinst-/Kleinunternehmen bei Art. 19–28). Die Seite beschreibt das Verfahren **freiwillig vollständig** (Kontaktstelle Art. 11/12, Meldung Art. 16, Begründung Art. 17, interne Beschwerde Art. 20 mit 6 Monaten, Streitbeilegung Art. 21, Missbrauch Art. 23).
- **Lücke Produkt/Text:** Begründung (Art. 17) wird in der App nur bei **ausgeblendeten Beiträgen** per Benachrichtigung zugestellt. Bei entfernten Kommentaren, Chat-Maßnahmen und Konto-Sperren gibt es **keine automatische Benachrichtigung**; der Text verspricht Zusendung „auf Anfrage oder per E-Mail“. Entweder Benachrichtigungsart bauen (siehe `DATENSCHUTZ-LAUNCH.md`, P4a) oder Text ändern.
- **Interne Beschwerde (Art. 20)** läuft nur per E-Mail, es gibt kein Formular und kein Konto-Sperr-Werkzeug (Sperren/Verwarnungen und Einspruchsverfahren stehen als Backlog in `OFFENE-PUNKTE.md`). Chat-Beweiskopien werden nur 30 Tage nach Erledigung aufbewahrt, die Beschwerdefrist beträgt 6 Monate (offene Abwägung).
- **Kein Transparenzbericht** (Art. 15/24) – für Kleinunternehmen ausgenommen; nicht erwähnt.
- Behördenzuständigkeit (Bundesnetzagentur als Koordinator für digitale Dienste) ist stimmig nach DDG, bitte gegenprüfen.

**Barrierefreiheit**
- Einstufung „teilweise vereinbar“ auf Basis der automatischen axe-Prüfung (Kernseiten, desktop und mobil), Kontrastprüfung, Touch-Ziele; **keine manuelle Screenreader-Prüfung, keine Extern-Prüfung**. Bekannte Lücken: keine Alt-Texte für Nutzerbilder, Story-Kachel ohne Textalternative, Rechnungs-PDF nicht PDF/UA. Ob das BFSG für Klubnest greift (Kleinstunternehmen sind für Dienstleistungen ausgenommen, Rechtsfrage), ist offen; die Erklärung gilt freiwillig.
- Marktüberwachungsbehörde (MLBF) und Schlichtungsstelle-Absatz bitte gegenprüfen.

**Impressum**
- § 5 DDG: Name, Rechtsform, Anschrift, Vertretung, Register, USt-IdNr., E-Mail; Telefon optional (EuGH: zweiter schneller Kommunikationsweg reicht, die Kontaktseite mit Postanschrift existiert). Keine Angabe nach § 18 Abs. 2 MStV (kein journalistisch-redaktioneller Inhalt des Betreibers).

**AVV (Version 2026-11-14-entwurf-2)**
- Meldefrist an Verein „in der Regel innerhalb von 48 Stunden“, Prüfung mit Ankündigung „in der Regel 14 Tage“, Kostenerstattung bei mehr als einer Prüfung/Jahr, Löschung „innerhalb von 30 Tagen nach Vertragsende“, Änderungsfrist Unterauftragsverarbeiter 30 Tage: **Verhandlungsgrößen, vom Gründer zu bestätigen**.
- Anwesenheit, Teams und Rollen sind als Auftrag aufgenommen; Termine/Zusagen/Helferlisten ausdrücklich nicht (Plattformfunktion, Rolle offen).
- TOM-Anhang beschreibt nur Vorhandenes (SSH nur Schlüssel, fail2ban, Updates, TLS, Verschlüsselung, Rollen, Protokolle, Backup-**Skript**); Offenes (Cloud-Firewall, Offsite-Backup, Alarme, DB-Rollen je Bereich, Pentest) steht nur in `docs/TOM.md`.
- Die Anzeige im Admin-Bereich zeigt weiterhin den ENTWURF-Hinweis (die Konstante `AVV_DRAFT_NOTICE` ist Teil des Hashes der alten Fassung und wurde nicht geändert; Wortlaut „Platzhalter“ ist dadurch etwas veraltet).
- Mit der neuen Version haben bestehende Vereine eine 30-Tage-Übergangsfrist (`AVV_GRACE_DAYS`), wenn sie die ältere Fassung akzeptiert haben.

## 4. Offene Rechtsfragen (für Anwalt/DSB, zusätzlich zu `OFFENE-PUNKTE.md`)

1. Zustimmungsfiktion bei Änderung der Nutzungsbedingungen und Wirksamkeit der Haftungsklauseln.
2. Gemeinsame Verantwortung (Art. 26) für öffentliche Vereinsseite, Termine, Zusagen, Helferlisten.
3. Push-Dienste der Browserhersteller: Drittland-Hinweis ausreichend? Eigene Rechtsgrundlage nach Art. 49 oder Verzicht.
4. Reicht die Beschreibung der Plattform-Moderation (Zugriff auf gemeldeten Chat-Klartext) als Information der Betroffenen? Ist § 3 TDDDG (Fernmeldegeheimnis) beim Chat zu beachten?
5. Art. 8 DSGVO bei Mitgliedern unter 16 in Jugendvereinen; Elternkonto.
6. Anwendbarkeit DSA (Online-Plattform, Kleinunternehmen) und BFSG; ob Betreiber ein Transparenzbericht/Beschwerdemanagement formal braucht.
7. Pflicht zur Benennung eines DSB (§ 38 BDSG) und Anforderung an eine DSFA (Feed-Profiling mit Einwilligung, Chat, Minderjährige).
8. Rechtsgrundlage Einladungsmail ohne Konto (lit. f des Vereins, § 7 UWG).
9. Datenschutzrechtliche Einordnung der Warteliste nach dem Start (Löschfrist, Rückfrage nach 24 Monaten).

## 5. Technische Hinweise

- Alle Seiten sind statisch erzeugte Server-Komponenten; Firmendaten werden beim Build eingebettet. Wer Werte ändert, muss Web neu bauen.
- Tests: `apps/web/app/legal-pages.test.tsx` (Seiten rendern, Inhaltsverzeichnis stimmt, keine Platzhalter bei vollen Firmendaten, keine verbotenen Formulierungen, keine Spenden/Zahlungen in den Nutzungsbedingungen, Fußzeile/Routen vollständig, interne Links gültig), `apps/web/lib/legal-config.test.ts` (Platzhalter, Warnung bei Indexierung, Build-Skript). Die Sitemap und robots.txt nutzen dieselbe Linkliste `apps/web/lib/legal-links.ts`.
- Neue Seite hinzufügen: Eintrag in `legal-links.ts`, Seite unter `app/<pfad>/page.tsx`; Tests erfassen sie automatisch.
- Der Browser-Check (Handy 375 px, Dark Mode, axe) für die neuen Seiten wurde nicht ausgeführt, nur Render- und Typtests. Vor dem Launch einmal in `e2e/` axe auf `/datenschutz`, `/hilfe`, `/meldeverfahren` ergänzen.
