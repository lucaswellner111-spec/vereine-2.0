# Verzeichnis der Verarbeitungstätigkeiten (VVT), Art. 30 DSGVO

Stand: 14. November 2026 (Paket A1). Abgeleitet aus `docs/DATENSCHUTZ-LAUNCH.md`, Abschnitt 2 (dort stehen die vollständigen Einzelheiten, Fristen und Sonderfälle). Bei jeder Etappe mit neuen personenbezogenen Daten **beide Dokumente** fortschreiben. Nicht anwaltlich oder durch eine:n DSB geprüft.

## Kopfdaten

| Angabe | Inhalt |
|---|---|
| Verantwortlicher (Teil A) / Auftragsverarbeiter (Teil B) | Betreiber von Klubnest: Firmenname, Rechtsform, Anschrift, Vertretung wie im Impressum (`apps/web/lib/legal-config.ts`, `NEXT_PUBLIC_LEGAL_*`) |
| Kontakt Datenschutz / DSB | `NEXT_PUBLIC_LEGAL_DPO` (Benennung offen, siehe `docs/OFFENE-PUNKTE.md`) |
| Empfängerkategorien (gesamt) | Hetzner Online GmbH (Hosting, DE), Scaleway SAS (E-Mail-Versand, Paris/FR), Push-Dienste der Browserhersteller (nur bei aktivem Push, eigene Verantwortliche), Vereine (je nach Rolle), Behörden bei gesetzlicher Pflicht |
| Übermittlung in Drittländer | keine durch den Betreiber. Ausnahme Browser-Push: Der Push-Dienst des Browserherstellers (z. B. Google, Apple, Microsoft, Mozilla) erhält nur die Geräteadresse und verschlüsselte Kurznachricht; Grundlage Einwilligung, Art. 6 Abs. 1 lit. a, Art. 49 Abs. 1 lit. a |
| Allgemeine TOM | `docs/TOM.md` |
| Löschfristen | `docs/LOESCHKONZEPT.md` |

Abkürzungen: **b** = Vertrag (Art. 6 Abs. 1 lit. b), **a** = Einwilligung, **c** = rechtliche Pflicht, **f** = berechtigtes Interesse.

## Teil A: Betreiber als Verantwortlicher (Art. 30 Abs. 1)

| Nr. | Tätigkeit und Zweck | Betroffene und Daten | Rechtsgrundlage | Fristen |
|---|---|---|---|---|
| A1 | **Konto und Anmeldung:** Registrierung, E-Mail-Bestätigung, Passwort-Reset, Adresswechsel | Nutzer: Name, E-Mail, Passwort-Hash, Erstellungsdatum; Einmal-Token als Hash (Zweck, Ablauf) | b | Konto bis Löschung; unbestätigte Registrierung 7 Tage; Token 7 Tage nach Ablauf/Einlösung |
| A2 | **Sitzungen:** Anmeldung aufrechterhalten | Token-Hash, grobe Gerätebeschreibung, Ablauf | b, f | 30 Tage, stündliche Bereinigung |
| A3 | **Einwilligungsnachweis:** Zustimmungen und Widerrufe (Nutzungsbedingungen, Datenschutz, personalisierter Feed, Sammelmail) | Zweck, Ja/Nein, Fassung, Zeit | Art. 7 Abs. 1 (c) | mit Konto, nur anhängend |
| A4 | **Zugriffsprotokoll:** Nachweis und Sicherheit bei sensiblen Aktionen | Nutzer-ID, Aktion, Zeit, IDs (keine Inhalte) | f; Rechnungsaktionen c | 12 Monate; Moderation 24 Monate; Rechnungsaktionen 10 Jahre; bei Kontolöschung ohne Personenbezug |
| A5 | **Zwei-Faktor (freiwillig):** Kontosicherheit | verschlüsseltes TOTP-Geheimnis, Notfallcode-Hashes | f | mit Konto / Deaktivierung |
| A6 | **Missbrauchsschutz:** Login-Drosselung, Nutzungslimits | Zähler je Hash(E-Mail+IP), je Hash(E-Mail), je Nutzer-ID (Redis) | f | läuft ab, höchstens 30 Tage |
| A7 | **Profil:** Auftritt und Auffindbarkeit | Handle, Bio, Ort, Avatar, Sichtbarkeit | b, a (freiwillige Angaben) | mit Konto |
| A8 | **Feed, Beiträge, Kommentare, Likes:** Kommunikation in und mit Vereinen | Inhalte, Autor, Zeit, Tags, Likes | b | mit Konto; gelöschter Beitrag 30 Tage (offene Meldung: bis Prüfung) |
| A9 | **Feed-Personalisierung:** Reihung nach Interessen | Interaktionen (Likes, „Weniger davon“), 30 Tage Affinität | a | bei Widerruf nicht mehr genutzt |
| A10 | **Bilder:** Hochladen und Anzeigen | Bilddatei (WebP, ohne EXIF), Besitzer | b | mit Konto/Beitrag; Vereinsbilder gehören dem Verein |
| A11 | **Umfragen:** Meinungsbild in Vereinen | Stimme je Person (nur als Zahl sichtbar) | b | mit Konto/Beitrag; max. 90 Tage Laufzeit |
| A12 | **Chat:** Nachrichten zwischen Mitgliedern | Nachrichten (AES-256-GCM, kein E2EE), Teilnehmer, Blockierliste | b | 365 Tage (je Gruppe 1–3650) |
| A13 | **Meldungen und Moderation (Beitrag, Kommentar, Chat):** Rechtsverstöße, Art. 16 DSA | Melder-ID, Gemeldeter, Grund, Notiz, bei Chat verschlüsselte Beweiskopie | c (DSA), f; Art. 17 Abs. 3 lit. e | bis Prüfung, Chat-Beweiskopie danach 30 Tage |
| A14 | **Benachrichtigungen in der App** | Typ, Kurzdaten (Name/Auszug der handelnden Person), Akteur-ID | b | 180 Tage; Akteur löscht Konto: Eintrag verschwindet |
| A15 | **Web-Push (freiwillig):** Hinweise aufs Gerät | Endpunkt, Schlüssel, User-Agent | a | bis Abmeldung; max. 10 Geräte |
| A16 | **Kalender-Abo:** Termine im Kalenderprogramm | Token-Hash | b | mit Konto, jederzeit neu/aus |
| A17 | **Vereinsbezug:** Mitgliedschaft, Rollen, Folgen, Einladungslinks, Teams | Nutzer-ID, Verein, Rolle; Einladung: Token-Hash und verschlüsselt, Ersteller | b | mit Konto/Austritt; Einladungen 30 Tage nach Ablauf |
| A18 | **Termine, Zusagen, Warteliste, Helferlisten:** Planung der Teilnahme | Zusage/Absage/Position je Person und Termin; Helfer-Eintragung | b, hilfsweise f | mit Absage, Austritt, Konto |
| A19 | **Öffentliche Vereinsseite, Vorschaubild, Story-Kachel:** Außendarstellung des Vereins | nur Vereinsdaten und Texte der letzten 10 Beiträge, keine Personendaten; OG-Bild je Abruf ohne Speicherung; Story-Kachel nur im Browser | f (Verein) | Cache 60 s; keine Speicherung |
| A20 | **Zugriffsbegrenzung öffentlicher Bereich** | Zähler je IP (Redis, im Schlüssel) | f | 60 Sekunden |
| A21 | **Server-Protokolle (Caddy/Docker):** Sicherheit, Fehlersuche | IP, Pfad, Zeit, Statuscode, Browserkennung | f | Rotation, Ziel höchstens 14 Tage |
| A22 | **E-Mail-Versand Konto:** Bestätigung, Passwort, Adresswechsel, „Konto existiert schon“ | Adresse, Vorlage, Inhalt inkl. Link; Warteschlange bis Versand | b | Job nach Versand entfernt |
| A23 | **Sammelmail:** tägliche Zusammenfassung | Adresse, Anzahlen; Einstellung (an/aus, seit, letzter Versand) | a | bis Widerruf/Konto |
| A24 | **Mail-Sperrliste und Kostenbremse** | HMAC der Adresse, Bereich, Grund, Datum; Zähler (Redis) | c, f | Bounce 12 Monate, Abmeldung 36 Monate; Zähler Stunde/Tag/Monat |
| A25 | **Warteliste:** Information über Start und Neuigkeiten (Double-Opt-in) | E-Mail, optional Rolle, Region, Vereinsname, Quelle; Einwilligungstext-Fassung, Zeiten; Link-Hash; Zähler (Redis) | a; Zähler f | unbestätigt 7 Tage; bestätigt bis Widerruf, spätestens 6 Monate nach Launch (Löschjob offen) |
| A26 | **Datenauskunft und Bilder-Export** | Export der eigenen Daten (keine Speicherung), Zähler | c (Art. 15, 20) | keine Speicherung; Limit 5/h |
| A27 | **Nachweis AVV-Zustimmung** | Verein, Fassung, Prüfsumme, zustimmende Person, Zeit (keine IP) | c (Art. 28 Abs. 3), f | Frist offen (Vorschlag: 3 Jahre nach Vertragsende); anonym bei Kontolöschung |
| A28 | **Lokaler Speicher im Browser** (Theme, Tastenkürzel, letzte Verwaltungswahl, Rückkehrziel) | keine Übermittlung an den Server | § 25 Abs. 2 Nr. 2 TDDDG | bis Browser-Speicher geleert |

## Teil B: Betreiber als Auftragsverarbeiter für Vereine (Art. 30 Abs. 2)

Verantwortlicher ist jeweils der Verein. Weisung: Nutzung der Funktionen durch Vorstand/Kasse und Vertrag zur Auftragsverarbeitung (Text: `packages/shared/src/avv.ts`, Zustimmung je Verein nachweisbar). Unterauftragsverarbeiter: Hetzner (Hosting), Scaleway (Mailversand). Drittland: keine. TOM: `docs/TOM.md`.

| Nr. | Tätigkeit | Daten | Fristen |
|---|---|---|---|
| B1 | **Mitgliederstammdaten:** Anschrift, Telefon, Geburtsdatum, Eintritt/Austritt, Beitragsklasse, Erziehungsberechtigte, Notiz | Mitglieder, Erziehungsberechtigte | Austritt löscht Personendaten (Nummer, Daten, Klasse bleiben ohne Namen); Kontolöschung löscht alle |
| B2 | **Mitglieder-Import per CSV:** Vormerkung, persönliche Einladung | Vorname, Nachname, E-Mail, optional Nummer, Eintritt, Klasse | Annahme: sofort löschen; sonst 30 Tage nach Versand / 60 Tage unversendet |
| B3 | **Beitragsläufe und Rechnungen (PDF, CSV, GiroCode):** Beitragsabrechnung | Name, Anschrift (Kopie), Beträge, Status; Ausstellerdaten des Vereins | Rechnungen 8–10 Jahre (GoBD/AO), nach Kontolöschung anonymisiert; Entwürfe jederzeit löschbar |
| B4 | **Einladungs- und Rechnungsmails im Auftrag des Vereins** | Adresse, Name, Link | Job nach Versand gelöscht; Sperrliste (A24) |
| B5 | **Anwesenheit:** da/fehlt/entschuldigt (ohne Grund) | Mitglied, Termin, Erfasser, Zeit | 24 Monate; Austritt löscht alle Einträge |
| B6 | **Teams und Rollen im Verein** | Zuordnung Person–Team/Rolle | mit Austritt/Konto |

## Offene Punkte zum VVT

- Abgrenzung Verantwortlicher/Auftragsverarbeiter/gemeinsam Verantwortliche bei A17–A19 (öffentliche Vereinsseite, Termine, Zusagen): `docs/OFFENE-PUNKTE.md`.
- Datenschutz-Folgenabschätzung für A9 (Profiling), A12 (Chat), Minderjährige: offen.
- DSB-Benennung und Datum der ersten Fassung eintragen, Änderungshistorie führen (Datum, Etappe, Änderung).

## Änderungshistorie

| Datum | Änderung |
|---|---|
| 2026-11-14 | Erstfassung (A1) aus `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 |
