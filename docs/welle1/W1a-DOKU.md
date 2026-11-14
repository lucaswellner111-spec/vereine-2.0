# W1a: CSV-Import als personalisierte Einladungen (Doku-Eintraege zum Uebernehmen)

Der Import selbst stammt aus Paket S5 (schon eingetragen). W1a ergaenzt Rate-Limit, Hinweistext, Ergebnisbericht in der UI und Tests. Diese Datei ersetzt keine Direkteintraege; bitte vom Hauptstrang uebernehmen.

## Zeile fuer docs/DATENSCHUTZ-LAUNCH.md, Abschnitt 2 (Ergaenzung der Zeile "Mitglieder-Import per CSV (S5)")

Ergaenzen in der Spalte "Rechtsgrundlage": "Rechtsgrundlage fuer Adressen Dritter ohne Konto **offen** (siehe offene Punkte). Im Import-Dialog steht nur: Verein ist verantwortlich und prueft, dass er einladen darf; nur Personen hochladen, die mit einer Einladung rechnen; Bestaetigungs-Checkbox \"Ich habe die Personen informiert\" vor dem Import."

Ergaenzen in der Spalte "Frist/Loeschung": "Nutzungslimits: 30 Pruefungen je Vorstand und Stunde, 20 Importe je Verein und Stunde (Antwort 429, ohne Adressen in Meldung oder Log). Ergebnisbericht nach dem Import (Anzahl eingeladen/heute/spaeter/uebersprungen) steht nur in der Oberflaeche, es wird nichts zusaetzlich gespeichert."

## Abschnitt 4 (Fristen): keine Aenderung

Fristen bleiben: 30 Tage nach Versand, 60 Tage unversendet, sofort bei Annahme oder Zurueckziehen.

## Offene Punkte (fuer docs/OFFENE-PUNKTE.md, Abschnitt Mitglieder/Einladungen/Mail)

- **Rechtsfrage Rechtsgrundlage und Werberecht:** Art. 6 Abs. 1 lit. f (berechtigtes Interesse) bzw. lit. b des Vereins fuer die Einladung an Adressen ohne Konto; bei **Nicht-Mitgliedern** zusaetzlich **ePrivacy / § 7 UWG** (E-Mail ohne vorherige Einwilligung kann unzulaessige Werbung sein). Mit DSB klaeren; bis dahin keine Rechtsgrundlagen-Aussage in der UI.

- **Sperrliste in der Vorschau:** Abgemeldete Adressen werden bewusst **nicht** in der Vorschau markiert (sonst koennte der Vorstand ueber Probe-Dateien herausfinden, wer sich abgemeldet hat); sie zaehlen still als verschickt. Entscheidung bestaetigen oder nur eine Gesamtzahl "n Adressen nicht zustellbar" ab mindestens 5 Zeilen ausgeben.
- **Vor- und Nachname Pflicht:** Der Import verlangt weiterhin Vorname und Nachname (Anrede in der Mail, Vormerkungstabelle `NOT NULL`). Optionale Namen braeuchten eine Migration (nicht Teil von W1a).
- **Erneut senden** abgelaufener Import-Einladungen fehlt weiterhin (Workaround: zurueckziehen und neu importieren).
- **Minderjaehrige** im Import (siehe S5): weiterhin ohne Altersangabe.
