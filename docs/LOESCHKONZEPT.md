# Löschkonzept (Art. 5 Abs. 1 lit. e, Art. 17 DSGVO)

Stand: 14. November 2026 (Paket A1). Fasst die umgesetzten Fristen und Löschwege zusammen. Quelle der Wahrheit für den Code: `apps/api/src/common/retention.ts` und die `purgeExpired`/`eraseUser`-Methoden der Bereichsdienste; Einzelheiten und Sonderfälle in `docs/DATENSCHUTZ-LAUNCH.md` (Abschnitt 2 und 4). Die Fristen sind **Vorschläge des Betreibers, noch nicht mit DSB/Anwalt bestätigt** (siehe `docs/welle2/A1-DOKU.md`).

## 1. Grundsätze

1. Daten werden gelöscht, sobald der Zweck entfällt; gesetzliche Aufbewahrungspflichten gehen vor (GoBD/AO für Rechnungen: 8–10 Jahre).
2. Löschen ist, wo möglich, automatisch: täglicher Job `privacy.retention` ruft die `purgeExpired`-Methoden der Bereichsdienste auf (blockweise je 1.000 Zeilen, höchstens 100.000 je Lauf und Schritt); die Bereiche kennen nur ihre eigenen Tabellen.
3. Kontolöschung und Austritt laufen sofort (Kaskaden und `eraseUser`-Handler) und werden bei Fehlern von Hintergrundjobs wiederholt (`privacy.erase-pending`, `orgs.leave-cleanup`).
4. Neue personenbezogene Tabellen bekommen im eigenen Dienst `exportFor`, `eraseUser` und, wenn nötig, `purgeExpired` (CLAUDE.md).
5. Zugriffsprotokolle enthalten keine Inhalte und werden bei Kontolöschung ohne Personenbezug weitergeführt.

## 2. Fristen im Überblick

| Daten | Frist | Auslöser | Mechanismus | Status |
|---|---|---|---|---|
| Konto, Profil, Beiträge, Kommentare, Likes, Bilder, Folgen, Zusagen, Push-Abos, Kalender-Token, 2FA, Einwilligungen | bis Kontolöschung (sofort) | Löschung durch die Person | Kaskade + `eraseUser` der Dienste | umgesetzt |
| Unbestätigte Registrierung | 7 Tage | Anlage | Job `privacy.retention` (`pendingAccounts`) | umgesetzt |
| Sitzungen | 30 Tage | Anmeldung | stündlicher Job `sessions.purge` | umgesetzt |
| Einmal-Links (Bestätigung, Passwort, Adresswechsel) | 7 Tage nach Ablauf/Einlösung | Ablauf | Job (`authTokens`) | umgesetzt |
| Benachrichtigungen | 180 Tage | Erstellung | Job (`notifications`); Kaskade über Akteur-ID bei Kontolöschung des Auslösers | umgesetzt |
| Gelöschte Beiträge (Zeile, Kommentare, Likes, Umfrage) | 30 Tage nach Löschung; Text/Tags/Bilder sofort | Löschung | Job (`deletedPosts`); Ausnahme: offene Meldung hält bis zur Prüfung | umgesetzt |
| Chat-Nachrichten | 365 Tage (je Gruppe 1–3650) | Nachricht | Chat-Job | umgesetzt |
| Chat-Beweiskopie (Meldung) | bis Prüfung, danach 30 Tage | Erledigung | Chat-Job | umgesetzt; **Abwägung mit Beschwerdefrist 6 Monate (Art. 20 DSA) offen** |
| Beitrags-/Kommentarmeldungen | mit Beitrag/Kommentar/Melder-Konto (Kaskade) | Löschung | Kaskade | umgesetzt; Beweissicherung gelöschter Kommentare offen |
| Zugriffsprotokoll allgemein | 12 Monate | Eintrag | Job (`auditDefault`) | umgesetzt |
| Zugriffsprotokoll Moderation | 24 Monate | Eintrag | Job (`auditModeration`) | umgesetzt |
| Zugriffsprotokoll Rechnungsaktionen | 10 Jahre | Eintrag | Job (`auditFinance`) | umgesetzt |
| Anwesenheit | 24 Monate ab Erfassung; Austritt: sofort | Erfassung | Job (`attendance`) + Austritts-Handler | umgesetzt |
| Einladungslinks | 30 Tage nach Ablauf/Widerruf | Ablauf | Job (`invites`) | umgesetzt |
| Mitglieder-Import (Vormerkung) | Annahme: sofort; sonst Ablauf der Einladung; nie versendet 60 Tage | Annahme/Ablauf | Job (`pendingMembersUnsent`) | umgesetzt |
| Mitgliederstammdaten | Austritt: Personendaten sofort; Kontolöschung: alles | Austritt/Löschung | `onLeave`-Ereignis, `eraseUser` | umgesetzt; Aufbewahrung der pseudonymen Austrittsdaten mit DSB klären |
| Rechnungen (finalisiert) | 8–10 Jahre; bei Kontolöschung anonymisiert | Rechnungsdatum | Anonymisierung | umgesetzt; **Löschjob nach Fristablauf, auch für gelöschte Vereine, fehlt** |
| Rechnungsentwürfe, Beitragsläufe | jederzeit; mit Verein gelöscht | Löschung | manuell/Kaskade | umgesetzt; Frist `fee_runs` offen |
| Mail-Sperrliste (Hash) | Bounce/Beschwerde 12 Monate; Abmeldung Einladungen 36 Monate; Warteliste-Abmeldung 36 Monate | Eintrag | Job (`mailBounce`, `mailUnsubscribe`) | umgesetzt; Wartelisten-Scope vor Newsletter-Versand überdenken |
| Mail-Warteschlange (Job `mail.send`) | bis Versand, danach sofort entfernt | Versand | BullMQ `removeOnComplete/Fail` | umgesetzt |
| Zähler Rate-Limit/Mail-Kosten/Login-Schutz | Sekunden bis 30 Tage | Ablauf | Redis-TTL | umgesetzt |
| Warteliste unbestätigt | 7 Tage nach letzter Anmeldung | Anmeldung | Job (`waitlistPending`) | umgesetzt |
| Warteliste bestätigt | bis Widerruf (sofort); höchstens 6 Monate nach Launch | Widerruf / Launch | Austragelink; **Löschjob offen** | teilweise |
| AVV-Zustimmung | Frist offen (Vorschlag: 3 Jahre nach Vertragsende); anonym bei Kontolöschung | Vertragsende | **kein Löschjob; Trigger verhindert einfaches DELETE** | offen |
| Server-Protokolle (Caddy/Docker) | Ziel höchstens 14 Tage | Eintrag | Docker-Log-Rotation (10 MB × 3) | teilweise (größenbasiert) |
| Sicherungen (Datenbank, Medien) | die letzten 14 | Sicherungslauf | `backup.sh` (`KEEP=14`) | teilweise: **kein automatischer Lauf** |
| Öffentlicher Cache (Vereinsseiten) | 60 Sekunden | Abruf | Redis-TTL | umgesetzt |

## 3. Abläufe

### 3.1 Löschung des Kontos (Art. 17)
1. Nutzer:in bestätigt mit dem Passwort (Einstellungen, Datenschutz). Ist die Person einziger Vorstand eines Vereins mit weiteren Mitgliedern, wird abgelehnt (409), bis die Rolle übertragen ist.
2. Konto sofort **sperren** (Löschzeitpunkt, alle Sitzungen beenden, Protokolleintrag). Keine Anmeldung mehr.
3. Daten aller Bereiche löschen oder anonymisieren (Kaskaden, `eraseUser` der Dienste: Chat, Mitglieder, Billing, Medien, Benachrichtigungen mit Akteur-ID, Warteliste mit Kontoadresse, AVV `accepted_by` leeren). Bricht das ab, schließt der stündliche Job `privacy.erase-pending` die Löschung nach 15 Minuten ab.
4. Ausnahmen: Rechnungen (anonymisiert), Chat-Beweiskopie offener Meldungen, AVV-Nachweis (ohne Namen), Sperrliste-Hash bei Abmeldungen.
5. Sicherungen enthalten die Daten bis zum Ende des Sicherungszeitraums (bis zu 14 Tage) und werden nicht einzeln bereinigt. Nach einer Wiederherstellung aus einer Sicherung müssen Löschungen nachgezogen werden (Liste der seit der Sicherung gelöschten Konten muss vor einer Wiederherstellung gesichert werden; **Verfahren schriftlich festlegen**, offen).

### 3.2 Austritt aus einem Verein
Stammdaten (Anschrift, Telefon, Geburtsdatum, Erziehungsberechtigte, Notiz), Team-Mitgliedschaften, Zusagen zu künftigen internen Terminen, Helferdienste künftiger Termine, Anwesenheit, Gruppen-Chats des Vereins werden entfernt. Nummer, Eintritt/Austritt, Beitragsklasse bleiben als Vereinsunterlage. Schlägt ein Schritt fehl, wiederholt `orgs.leave-cleanup`.

### 3.3 Löschung eines Vereins
Ist die löschende Person das einzige aktive Mitglied, wird der Verein gelöscht: Beiträge, Termine, Teams, Einladungen, Gruppen-Chats, Stammdaten, Beitragsklassen, Zähler, Rechnungsentwürfe, Beitragsläufe, Vereinsbilder. Finalisierte Rechnungen bleiben bis Fristende.

### 3.4 Betroffenenanfrage (Löschung, Auskunft) per E-Mail
1. Eingang an die Datenschutzadresse prüfen, Identität über die Konto-Adresse bestätigen (Antwort nur an diese).
2. Betrifft die Anfrage Mitgliederdaten eines Vereins: an den Verein weiterleiten (Verantwortlicher), Eingang bestätigen.
3. Frist: eine Antwort innerhalb eines Monats (Art. 12 Abs. 3); Verlängerung um zwei Monate mit Begründung möglich.
4. Löschung wo möglich selbst auslösen (Konto-Löschung) oder durch Betreiber nach Abschnitt 3.1; Ergebnis dokumentieren (Datum, Art, ohne Inhalte).

### 3.5 Prüfung
Mindestens jährlich: Fristen gegen Code (`retention.ts`) und Datenschutzerklärung prüfen, Löschjobs auf Fehler prüfen (Warteschlange, Logs), Stichprobe Sicherungsablauf.

## 4. Offene Punkte
- Löschjob für finalisierte Rechnungen nach Ablauf der Aufbewahrungsfrist (insbesondere gelöschter Vereine) und für `billing.fee_runs`.
- Löschjob bestätigter Wartelisteneinträge (6 Monate nach Launch, Launch-Datum festlegen) bzw. Rückfrage nach 24 Monaten.
- Frist und Löschweg für AVV-Zustimmungen (Trigger beachten, `docs/welle1/W1c-DOKU.md`).
- Backup-Automatisierung und Löschverfahren nach Wiederherstellung.
- Frist Beweiskopie Chat-Meldungen (30 Tage) gegen Art. 20 DSA (6 Monate).
- Fristen insgesamt mit DSB bestätigen.
