# Prozess bei Verletzung des Schutzes personenbezogener Daten (Art. 33, 34 DSGVO)

Stand: 14. November 2026 (Paket A1). Gilt für den Betreiber (als Verantwortlicher und als Auftragsverarbeiter). Nicht von DSB/Anwalt geprüft; vor dem Echtbetrieb einmal als Übung durchspielen (Abschnitt 8). Kurzfassung für den Ernstfall: Abschnitt 2.

## 1. Was ist eine Datenpanne?

Jede Verletzung der Sicherheit, die zu Vernichtung, Verlust, Veränderung, unbefugter Offenlegung oder unbefugtem Zugang zu personenbezogenen Daten führt, **auch ohne Angriff und auch bei Verdacht**. Beispiele bei Klubnest: Zugriff Dritter auf Datenbank oder Server, abgeflossene Schlüssel (`CHAT_MASTER_KEYS`, `AUTH_SECRET_KEY`, `.env.preview`), Fehler, durch den Nutzer fremde Profile, Chats, Rechnungen oder Mitgliederdaten sehen, E-Mail an falsche Empfänger oder offener Verteiler, verlorenes Gerät mit Zugang, Backup in falschen Händen, Fehlkonfiguration (öffentlich erreichbares `/metrics`, Datenbank, Redis), Ausfall ohne Wiederherstellung (Verfügbarkeit).

## 2. Kurzablauf (72 Stunden)

**Die 72 Stunden laufen ab dem Moment, in dem der Betreiber (als Verantwortlicher) von der Verletzung Kenntnis hat.** Als Auftragsverarbeiter für Vereine meldet der Betreiber unverzüglich, in der Regel binnen 48 Stunden, an den Verein (AVV Abschnitt 7); die 72 Stunden des Vereins laufen ab dessen Kenntnis.

| Stufe | Wann | Was | Wer |
|---|---|---|---|
| 0 Erkennen | sofort | Verdacht festhalten: Zeitpunkt, wer hat es bemerkt, womit. Nichts löschen (Beweise). Ticket/Protokoll anlegen (Vorlage A) | jede:r Beteiligte |
| 1 Melden intern | sofort, spätestens 1 Stunde | Meldung an die Leitung Datenschutzvorfall (Abschnitt 3) per Telefon, nicht nur per E-Mail | jede:r Beteiligte |
| 2 Eindämmen | in Stunden | Zugänge sperren, Schlüssel rotieren, betroffene Funktion abschalten, Sitzungen beenden, Fehler beheben | Technik |
| 3 Bewerten | binnen 24 h | Risiko bewerten (Abschnitt 5), Betroffene und Daten eingrenzen | Leitung + Technik (+ DSB) |
| 4 Melden an Behörde | **binnen 72 h nach Kenntnis**, wenn ein Risiko für Betroffene nicht ausgeschlossen ist | Meldung an die Aufsichtsbehörde (Vorlage B), notfalls in Stufen (Art. 33 Abs. 4) | Leitung (+ DSB) |
| 5 Benachrichtigen | unverzüglich bei hohem Risiko | Betroffene informieren (Vorlage C); Vereine als Verantwortliche informieren (Vorlage D) | Leitung |
| 6 Dokumentieren | laufend | Jede Verletzung dokumentieren, auch ohne Meldung (Art. 33 Abs. 5) | Leitung |
| 7 Nachbereiten | binnen 14 Tagen | Ursache, Maßnahmen, Anpassung TOM, VVT, Datenschutzerklärung | Leitung + Technik |

## 3. Rollen

| Rolle | Aufgaben | Besetzung (eintragen) |
|---|---|---|
| **Leitung Datenschutzvorfall** | entscheidet über Meldungen, hält Frist, Ansprechpartner Behörde | [Geschäftsführung, Name, Telefon] |
| **Vertretung** | wie oben bei Abwesenheit | [Name, Telefon] |
| **Technik** | Eindämmung, Forensik, Wiederherstellung, Beweissicherung | [Name, Telefon] |
| **Datenschutzbeauftragte:r / Datenschutzkontakt** | berät, prüft Meldung | `NEXT_PUBLIC_LEGAL_DPO` |
| **Kommunikation** | Texte an Betroffene und Vereine, Support | [Name] |
| **Anwalt** (bei hohem Risiko) | Rechtsberatung, Strafanzeige | [Kanzlei, Telefon] |

Kontaktliste (Telefon, nicht nur E-Mail) **vor dem Start** ausfüllen und ausdrucken/offline ablegen.

## 4. Sofortmaßnahmen der Technik (je nach Fall)

1. **Beweise sichern, bevor man abschaltet:** Server-Snapshot oder Kopie relevanter Logs (Docker-Logs, Caddy-Logs, Auth-/Zugriffsprotokoll `identity.audit_log`), Zeitpunkte notieren.
2. **Zugänge sperren:** SSH-Schlüssel, Hetzner-Konto-Token, Scaleway-API-Schlüssel, GitHub-Zugang des Betroffenen widerrufen.
3. **Schlüssel rotieren:** `AUTH_SECRET_KEY` (setzt 2FA-Geheimnisse und Einladungs-Token neu: Folgen vorher prüfen), `CHAT_MASTER_KEYS` (neuen Schlüssel ergänzen, `CHAT_ACTIVE_KEY_VERSION` erhöhen, Job `chat.rewrap-keys`; **alten Schlüssel nicht vernichten**, sonst sind Chats unlesbar), `METRICS_TOKEN`, VAPID, Datenbank- und Redis-Kennwörter, SMTP-Zugang.
4. **Sitzungen beenden:** alle Sitzungen löschen (Nutzer müssen sich neu anmelden), bei Passwortverdacht Passwort-Reset erzwingen.
5. **Funktion abschalten:** betroffene Route sperren (Caddy), Dienst stoppen (Chat-Gateway, Mail-Treiber auf `log` stellen).
6. **Fehler beheben, Test hinzufügen**, Release, Beobachtung.
7. **Wiederherstellung** aus Sicherung nur nach Abschnitt 3.1 des Löschkonzepts (Löschungen nachziehen).

## 5. Risikobewertung (Art. 33/34)

Fragen: Welche Daten? Wie viele Personen? Zugriff nur theoretisch oder nachweislich? Waren die Daten verschlüsselt (Chat ohne Schlüssel unlesbar; Passwörter nur Hash)? Besondere Kategorien, Minderjährige, Finanzdaten (Rechnungen, IBAN des Vereins) betroffen? Missbrauch wahrscheinlich (Identitätsdiebstahl, Betrug, Bloßstellung)?

| Risiko | Beispiel | Pflicht |
|---|---|---|
| **Kein Risiko** | Daten Dritter nie lesbar (nur verschlüsselter Speicher ohne Schlüssel gestohlen), Fehlversand wurde vollständig zurückgeholt | nur dokumentieren (Art. 33 Abs. 5) |
| **Risiko** | Zugriff auf Namen/E-Mail-Adressen, Mitgliederlisten, Chat-Metadaten | Meldung an Aufsichtsbehörde binnen 72 h |
| **Hohes Risiko** | Zugriff auf Chat-Klartext, Rechnungen mit Anschrift/IBAN, Passwort-Hashes mit Schwäche, Daten Minderjähriger, 2FA-Geheimnisse | Meldung **und** Benachrichtigung der Betroffenen (Art. 34) |

Im Zweifel melden. Betrifft die Verletzung Daten, die der Betreiber **im Auftrag** eines Vereins verarbeitet (Mitgliederdaten, Rechnungen), meldet der Verein an die Behörde; der Betreiber informiert den Verein (Vorlage D) und liefert alle Angaben nach.

## 6. Zuständige Stelle

Aufsichtsbehörde nach Sitz des Betreibers (`NEXT_PUBLIC_LEGAL_AUTHORITY`, Online-Meldeformular der Behörde nutzen). Bei grenzüberschreitenden Fällen federführende Behörde nach Art. 56. Notieren: Link zum Meldeformular, Zugangsdaten nicht in Dokument.

## 7. Vorlagen

### Vorlage A: Interne Meldung und Protokoll
- Aktenzeichen / Datum:
- Entdeckt am / um (Uhr), von wem, wie:
- **Kenntnis des Verantwortlichen am / um** (Start der 72 Stunden):
- Was ist passiert (Fakten, keine Vermutungen)?
- Betroffene Systeme / Funktionen / Zeitraum:
- Betroffene Datenarten und geschätzte Zahl der Personen (Nutzer, Mitglieder, Vereine, Minderjährige?):
- Verschlüsselung / Schutz der Daten:
- Sofortmaßnahmen und Zeitpunkte:
- Risiko (kein / Risiko / hoch) mit Begründung:
- Meldung an Behörde: ja/nein, Datum, Aktenzeichen; Begründung bei nein:
- Benachrichtigung Betroffene / Vereine: ja/nein, Datum:
- Ursache, Maßnahmen zur Abhilfe, Änderungen an TOM/Doku:
- Abgeschlossen am / von:

### Vorlage B: Meldung an die Aufsichtsbehörde (Inhalt nach Art. 33 Abs. 3)
1. **Verantwortlicher:** Name, Anschrift, Kontakt, DSB/Ansprechperson.
2. **Art der Verletzung:** Beschreibung, Zeitpunkt (Beginn, Entdeckung), Dauer, Ursache (soweit bekannt).
3. **Betroffene Kategorien und ungefähre Zahl** der Personen und Datensätze.
4. **Wahrscheinliche Folgen** für die Betroffenen.
5. **Ergriffene und vorgeschlagene Maßnahmen** zur Behebung und Abmilderung.
6. **Benachrichtigung der Betroffenen:** erfolgt am / geplant / nicht erforderlich, Begründung.
7. **Gründe einer Verspätung** (bei Meldung nach 72 h) oder Hinweis auf nachgereichte Angaben (Art. 33 Abs. 4).

### Vorlage C: Information der Betroffenen (Art. 34, klar und einfach)
> Betreff: Wichtige Information zu deinen Daten bei Klubnest
>
> Hallo [Name],
>
> am [Datum] haben wir festgestellt, dass [kurz und sachlich, was passiert ist]. Betroffen sind [Datenarten, z. B. Name und E-Mail-Adresse]. [Nicht betroffen sind z. B. dein Passwort, das nur als geschützter Hash gespeichert ist.]
>
> Was das für dich bedeuten kann: [wahrscheinliche Folgen, z. B. Phishing-Mails].
> Was wir getan haben: [Maßnahmen].
> Was du tun kannst: [z. B. Passwort ändern, Zwei-Faktor einschalten, auf verdächtige Mails achten, bei Rückfragen melden].
>
> Ansprechpartner für Fragen: [Name, E-Mail, Telefon]. Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren.
>
> [Unterschrift Geschäftsführung]

### Vorlage D: Meldung an einen Verein als Verantwortlichen (AVV Abschnitt 7)
> Betreff: Meldung einer Verletzung des Schutzes personenbezogener Daten (Vertrag zur Auftragsverarbeitung)
>
> Sehr geehrte Damen und Herren des Vorstands von [Verein],
>
> wir melden eine Verletzung, die Daten Ihres Vereins betrifft. Zeitpunkt der Kenntnis: [Datum, Uhr]. Art der Verletzung: [Beschreibung]. Betroffene Datenkategorien und ungefähre Zahl der Betroffenen: [ ]. Wahrscheinliche Folgen: [ ]. Ergriffene und vorgeschlagene Maßnahmen: [ ]. Ansprechperson bei uns: [Name, Telefon, E-Mail].
>
> Die Meldung an die Aufsichtsbehörde (Frist 72 Stunden ab Ihrer Kenntnis) und die Benachrichtigung der Betroffenen obliegen Ihnen als Verantwortlichem. Wir unterstützen Sie dabei und liefern fehlende Angaben unverzüglich nach.
>
> [Unterschrift]

## 8. Übung und Pflege

- Vor dem Echtbetrieb einmal als Planübung (Szenario: Chat-Master-Key abgeflossen) durchspielen und die Kontaktliste testen. Ergebnis hier eintragen.
- Jährlich und nach jedem Vorfall überprüfen; Zuständigkeiten aktuell halten (Telefonnummern).
- Meldung der Zuständigkeit (Aufsichtsbehörde, Meldeformular-Link) hier eintragen: [ ].

## 9. Offene Punkte
- Kontaktliste und Besetzung der Rollen ausfüllen, Anwalt benennen.
- Monitoring und Alarme (TOM, offen) einrichten, damit Vorfälle schneller auffallen.
- Verfahren für Löschungen nach Wiederherstellung aus Sicherung (Löschkonzept 3.1).
