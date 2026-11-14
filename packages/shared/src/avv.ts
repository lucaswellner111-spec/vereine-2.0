import { z } from "zod";

/**
 * Vertrag zur Auftragsverarbeitung (AVV, Art. 28 DSGVO) zwischen Verein (Verantwortlicher) und Betreiber (Auftragsverarbeiter).
 *
 * ENTWURF: Die aktuelle Fassung (A1) ist ein vollstaendiger Vertragstext, aber noch nicht anwaltlich geprueft
 * (status "draft"). Die Freigabe durch Anwalt/Datenschutzbeauftragte:n setzt "final" und erhoeht die Version
 * (docs/DATENSCHUTZ-LAUNCH.md, docs/OFFENE-PUNKTE.md). Gebaut ist die Mechanik: Version, Hash, Akzeptanz, Durchsetzung.
 *
 * REGEL: Jede inhaltliche Aenderung am Text erhoeht `version`. Der Test `avv/avv-document.spec.ts` haelt je Version den
 * SHA-256-Hash des gerenderten Textes fest und schlaegt fehl, wenn sich Text und Version nicht entsprechen.
 */

export type AvvSection = { heading: string; paragraphs: string[] };
export type AvvDocument = {
  version: string;
  /** "draft" = Platzhalter ohne Anwaltspruefung; "final" erst nach Freigabe durch Anwalt/DSB. */
  status: "draft" | "final";
  title: string;
  /** Veroeffentlichungstag (Berliner Datum); Beginn der Uebergangsfrist fuer Vereine mit aelterer Version. */
  publishedAt: string;
  sections: AvvSection[];
};

/** Tage, in denen Vereine mit einer AELTEREN akzeptierten Version nach Veroeffentlichung einer neuen weiterarbeiten duerfen. */
export const AVV_GRACE_DAYS = 30;

export const AVV_DRAFT_NOTICE = "ENTWURF – Platzhalter, Anwaltsprüfung ausstehend. Dieser Text ist noch kein rechtlich geprüfter Vertrag.";

/** Erste Fassung (Platzhalter). NICHT AENDERN: Zustimmungen verweisen auf Version und Hash dieses Textes. */
export const AVV_DOCUMENT_V1: AvvDocument = {
  version: "2026-11-13-entwurf-1",
  status: "draft",
  title: "Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO)",
  publishedAt: "2026-11-13",
  sections: [
    {
      heading: "1. Parteien und Gegenstand",
      paragraphs: [
        "Der Verein ist Verantwortlicher im Sinne der DSGVO. Der Betreiber der Plattform Klubnest ist Auftragsverarbeiter.",
        "Gegenstand ist die Verarbeitung personenbezogener Daten der Vereinsmitglieder im Auftrag des Vereins, soweit der Verein dafür die Mitgliederverwaltung, Beitragsklassen, Beitragsläufe, Rechnungen sowie den Versand von Einladungs- und Rechnungsmails der Plattform nutzt.",
      ],
    },
    {
      heading: "2. Art und Zweck der Verarbeitung",
      paragraphs: [
        "Speichern, Ordnen, Anzeigen, Ändern, Exportieren und Löschen von Mitgliederstammdaten, Erzeugen und Bereitstellen von Rechnungen und Beitragsrechnungen, Versand von Einladungs- und Rechnungsmails im Auftrag des Vereins.",
        "Zweck ist die Verwaltung der Mitgliedschaft und der Beiträge des Vereins. Eine Verarbeitung für eigene Zwecke des Betreibers findet in diesem Auftrag nicht statt.",
      ],
    },
    {
      heading: "3. Kategorien personenbezogener Daten",
      paragraphs: [
        "Name, Kontaktdaten (E-Mail-Adresse, Anschrift, Telefon), Geburtsdatum, Mitgliedsnummer, Eintritts- und Austrittsdatum, Beitragsklasse, Angaben zu Erziehungsberechtigten bei Minderjährigen, interne Notizen des Vereins, Rechnungsdaten (Empfänger, Beträge, Status).",
      ],
    },
    {
      heading: "4. Kategorien betroffener Personen",
      paragraphs: ["Mitglieder des Vereins, Erziehungsberechtigte minderjähriger Mitglieder, Vorstandsmitglieder und weitere Funktionsträger des Vereins."],
    },
    {
      heading: "5. Pflichten des Auftragsverarbeiters",
      paragraphs: [
        "Verarbeitung nur auf dokumentierte Weisung des Vereins (die Weisung ergibt sich aus der Nutzung der Funktionen der Plattform durch den Vorstand), Vertraulichkeitsverpflichtung der eingesetzten Personen, Umsetzung der technischen und organisatorischen Maßnahmen nach Abschnitt 7, Unterstützung bei Betroffenenrechten (Auskunft, Berichtigung, Löschung, Übertragbarkeit) und bei der Meldung von Datenschutzverletzungen ohne unangemessene Verzögerung.",
        "Der Auftragsverarbeiter informiert den Verein, wenn eine Weisung nach seiner Auffassung gegen Datenschutzrecht verstößt, und stellt die für den Nachweis der Pflichten nötigen Informationen bereit; Überprüfungen durch den Verein oder einen beauftragten Prüfer sind nach Absprache möglich.",
      ],
    },
    {
      heading: "6. Pflichten des Vereins",
      paragraphs: [
        "Der Verein stellt sicher, dass er für die Verarbeitung eine Rechtsgrundlage hat und seine Mitglieder nach Art. 13 und 14 DSGVO informiert. Er pflegt nur Daten ein, die er für die Mitgliederverwaltung benötigt, und importiert nur eigene Mitglieder. Einladungen per E-Mail verschickt er nur an Personen, die damit rechnen.",
      ],
    },
    {
      heading: "7. Technische und organisatorische Maßnahmen (TOM)",
      paragraphs: [
        "Die Maßnahmen ergeben sich aus dem TOM-Dokument des Betreibers (Verweis: TOM-Dokument, Fassung wird mit der endgültigen Vertragsfassung beigefügt). Dazu gehören unter anderem Verschlüsselung bei der Übertragung, Zugriffsbeschränkung nach Rollen, Zugriffsprotokoll für Finanzaktionen, Bereichstrennung der Daten, regelmäßige Sicherungen und eine Löschkonzeption.",
      ],
    },
    {
      heading: "8. Unterauftragsverarbeiter",
      paragraphs: [
        "Der Verein erteilt die allgemeine Genehmigung zum Einsatz folgender Unterauftragsverarbeiter. Der Betreiber informiert den Verein vor einer Änderung; der Verein kann aus wichtigem Grund widersprechen.",
        "Hetzner Online GmbH, Deutschland: Hosting und Speicherung (Rechenzentrum in Deutschland).",
        "Scaleway SAS, Frankreich (Rechenzentrum Paris): Versand von E-Mails (Einladungs- und Rechnungsmails).",
        "Eine Übermittlung in Drittländer findet nicht statt.",
      ],
    },
    {
      heading: "9. Löschung und Rückgabe bei Vertragsende",
      paragraphs: [
        "Nach Beendigung der Nutzung löscht der Betreiber die im Auftrag verarbeiteten Daten des Vereins oder gibt sie auf Verlangen heraus (Export), soweit keine gesetzliche Aufbewahrungspflicht besteht. Finalisierte Rechnungen werden bis zum Ablauf der gesetzlichen Aufbewahrungsfristen gesperrt aufbewahrt.",
      ],
    },
    {
      heading: "10. Laufzeit, Änderungen und Nachweis",
      paragraphs: [
        "Der Vertrag gilt für die Dauer der Nutzung der genannten Funktionen. Bei einer neuen Fassung muss der Vorstand erneut zustimmen; für die Umstellung gilt eine Übergangsfrist. Die Zustimmung wird mit Version, Textprüfsumme, Zeitpunkt und zustimmender Person nachweisbar gespeichert.",
      ],
    },
  ],
};

/**
 * Zweite Fassung (A1): vollstaendiger Vertragstext nach Art. 28 Abs. 3 DSGVO mit TOM-Anhang und Liste der
 * Unterauftragsverarbeiter. Status bleibt "draft", bis Anwalt/DSB den Text freigegeben haben.
 * Inhaltliche Quelle: docs/DATENSCHUTZ-LAUNCH.md, docs/TOM.md, docs/VVT.md.
 */
export const AVV_DOCUMENT: AvvDocument = {
  version: "2026-11-14-entwurf-2",
  status: "draft",
  title: "Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO)",
  publishedAt: "2026-11-14",
  sections: [
    {
      heading: "1. Parteien, Gegenstand und Dauer",
      paragraphs: [
        "Dieser Vertrag gilt zwischen dem Verein, der ihn in der Plattform annimmt (nachfolgend Verein oder Verantwortlicher), und dem Betreiber der Plattform Klubnest (nachfolgend Betreiber oder Auftragsverarbeiter). Name und Anschrift des Betreibers stehen im Impressum auf klubnest.de, der Verein ist durch seine Vereinsdaten in der Plattform bestimmt.",
        "Gegenstand ist die Verarbeitung personenbezogener Daten im Auftrag des Vereins, soweit der Verein die Mitgliederverwaltung der Plattform nutzt: Mitgliederstammdaten, Beitragsklassen, Beitragsläufe, Rechnungen, Mitglieder-Import, Einladungen und Rechnungsmails, Anwesenheitserfassung und die Verwaltung von Rollen und Terminen des Vereins, soweit dabei Daten von Personen verarbeitet werden.",
        "Der Vertrag gilt ab der Zustimmung durch den Vorstand und für die Dauer der Nutzung dieser Funktionen durch den Verein. Er endet mit der Löschung des Vereins in der Plattform oder der Beendigung des Nutzungsvertrags, im Übrigen nach Abschnitt 12 und 14.",
        "Nicht Gegenstand dieses Vertrags sind Verarbeitungen, für die der Betreiber selbst Verantwortlicher ist, insbesondere Konto, Anmeldung, Profile, Beiträge, Kommentare und Chat der Nutzerinnen und Nutzer sowie Sicherheit und Betrieb der Plattform. Dafür gilt die Datenschutzerklärung des Betreibers.",
      ],
    },
    {
      heading: "2. Art und Zweck der Verarbeitung",
      paragraphs: [
        "Art der Verarbeitung: Erheben, Speichern, Ordnen, Anzeigen, Ändern, Übermitteln an die vom Verein bestimmten Rollen, Exportieren, Einschränken, Löschen und Anonymisieren.",
        "Zweck: Verwaltung der Mitgliedschaft und der Beiträge des Vereins, Erstellung und Bereitstellung von Rechnungen als PDF, Einladung und Information der Mitglieder des Vereins, Planung des Vereinsbetriebs (Anwesenheit, Teams). Eine Verarbeitung für eigene Zwecke des Betreibers findet im Rahmen dieses Auftrags nicht statt. Der Betreiber führt keine Auswertung dieser Daten zu Werbe- oder Profilbildungszwecken durch.",
      ],
    },
    {
      heading: "3. Kategorien personenbezogener Daten",
      paragraphs: [
        "Stammdaten: Name, Anschrift, Telefon, Geburtsdatum, Mitgliedsnummer, Eintritts- und Austrittsdatum, Beitragsklasse, Angaben zu Erziehungsberechtigten bei Minderjährigen (Name, E-Mail-Adresse), interne Notizen des Vereins.",
        "Kontaktdaten: E-Mail-Adresse (Konto-Daten der Person, beim Import als vorübergehende Vormerkung), Name der Empfängerin oder des Empfängers von Einladungen.",
        "Abrechnungsdaten: Rechnungsempfänger (Name, Anschrift als Kopie), Beträge, Rechnungsnummer, Status, Zeitpunkte, Angaben des Vereins als Aussteller (Name, Anschrift, Bankverbindung, Steuerhinweis).",
        "Teilnahmedaten: Zusage, Absage und Warteliste je Termin, Eintragung in Helferdienste, Anwesenheit (da, fehlt, entschuldigt, ohne Grund und ohne Freitext), Mitgliedschaft in Teams.",
        "Protokolldaten: Nutzer-ID, Aktion und Zeitpunkt für Zugriffe auf Mitgliederdaten (zum Beispiel Export der Mitgliederliste, Zustimmung zu diesem Vertrag, Rechnungsaktionen).",
        "Besondere Kategorien personenbezogener Daten (Art. 9 DSGVO) sind nicht vorgesehen. Der Verein darf sie nicht in Notizen oder Freitexten ablegen.",
      ],
    },
    {
      heading: "4. Kategorien betroffener Personen",
      paragraphs: [
        "Mitglieder des Vereins (auch frühere und eingeladene, aber noch nicht beigetretene Personen), Erziehungsberechtigte minderjähriger Mitglieder, Vorstandsmitglieder und weitere Funktionsträger des Vereins sowie Rechnungsempfänger.",
      ],
    },
    {
      heading: "5. Weisungen des Vereins",
      paragraphs: [
        "Der Betreiber verarbeitet die Daten nur auf dokumentierte Weisung des Vereins, auch in Bezug auf Übermittlungen in Drittländer, es sei denn, er ist durch Recht der Union oder eines Mitgliedstaats zur Verarbeitung verpflichtet; dann teilt er dem Verein die rechtlichen Anforderungen vor der Verarbeitung mit, sofern das Recht das nicht wegen eines wichtigen öffentlichen Interesses verbietet.",
        "Die Weisung ergibt sich aus diesem Vertrag und aus der Nutzung der Funktionen der Plattform durch die dazu berechtigten Personen des Vereins (Vorstand, Kasse nach ihren Rechten). Weitere Weisungen erteilt der Vorstand in Textform an die Kontaktadresse des Betreibers.",
        "Der Betreiber informiert den Verein unverzüglich, wenn eine Weisung nach seiner Auffassung gegen Datenschutzrecht verstößt. Er darf die Ausführung aussetzen, bis der Verein sie bestätigt oder ändert.",
      ],
    },
    {
      heading: "6. Pflichten des Auftragsverarbeiters",
      paragraphs: [
        "Vertraulichkeit: Der Betreiber verpflichtet die mit der Verarbeitung befassten Personen zur Vertraulichkeit oder stellt sicher, dass sie einer gesetzlichen Verschwiegenheitspflicht unterliegen. Zugriff auf Mitgliederdaten haben nur Personen, die ihn für Betrieb, Fehlerbehebung und Unterstützung des Vereins brauchen.",
        "Sicherheit: Der Betreiber setzt die technischen und organisatorischen Maßnahmen nach Anhang 1 um, prüft sie regelmäßig und entwickelt sie nach dem Stand der Technik weiter. Wesentliche Verschlechterungen des Schutzniveaus sind unzulässig.",
        "Betroffenenrechte: Der Betreiber unterstützt den Verein mit geeigneten technischen und organisatorischen Maßnahmen bei der Erfüllung der Rechte der betroffenen Personen (Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch). Mitglieder können ihre eigenen Daten in der Plattform selbst einsehen, ändern und exportieren. Wendet sich eine betroffene Person direkt an den Betreiber, leitet er die Anfrage unverzüglich an den Verein weiter und beantwortet sie nicht selbst, es sei denn, der Verein weist ihn dazu an.",
        "Unterstützung bei Pflichten des Vereins: Der Betreiber unterstützt den Verein bei der Sicherheit der Verarbeitung, bei der Meldung von Verletzungen des Schutzes personenbezogener Daten, bei Datenschutz-Folgenabschätzungen und bei der Konsultation der Aufsichtsbehörde (Art. 32 bis 36 DSGVO), soweit diese Pflichten den Verein treffen und die Unterstützung dem Betreiber möglich ist.",
        "Verzeichnis: Der Betreiber führt ein Verzeichnis aller im Auftrag verarbeiteten Tätigkeiten (Art. 30 Abs. 2 DSGVO). Er hat einen Prozess für Datenschutzverletzungen mit Rollen und Fristen.",
      ],
    },
    {
      heading: "7. Meldung von Datenschutzverletzungen",
      paragraphs: [
        "Der Betreiber meldet dem Verein jede Verletzung des Schutzes personenbezogener Daten, die Daten dieses Vertrags betrifft, unverzüglich nach Bekanntwerden, in der Regel innerhalb von 48 Stunden, an die in der Plattform hinterlegte Kontaktadresse des Vorstands.",
        "Die Meldung enthält, soweit bekannt: Art der Verletzung, betroffene Datenkategorien und ungefähre Zahl der Betroffenen, wahrscheinliche Folgen, ergriffene und vorgeschlagene Maßnahmen und eine Ansprechperson. Fehlende Angaben liefert der Betreiber nach, sobald sie vorliegen. Die Meldung an die Aufsichtsbehörde und die Benachrichtigung der Betroffenen übernimmt der Verein als Verantwortlicher; der Betreiber unterstützt ihn dabei.",
      ],
    },
    {
      heading: "8. Pflichten des Vereins",
      paragraphs: [
        "Der Verein ist für die Rechtmäßigkeit der Verarbeitung verantwortlich und stellt sicher, dass er für jede Verarbeitung eine Rechtsgrundlage hat. Er informiert seine Mitglieder und alle betroffenen Personen nach Art. 13 und 14 DSGVO über die Verarbeitung, auch über den Einsatz der Plattform und der Unterauftragsverarbeiter.",
        "Der Verein pflegt nur Daten ein, die er für die Vereinsarbeit braucht, und legt keine besonderen Kategorien personenbezogener Daten (zum Beispiel Gesundheitsdaten) in Notizen oder Freitexten ab. Er importiert nur eigene Mitglieder, bestätigt vor dem Import, dass er sie informiert hat, und lädt nur Personen per E-Mail ein, die damit rechnen. Hat der Verein minderjährige Mitglieder, sorgt er für die erforderlichen Einwilligungen und Informationen der Erziehungsberechtigten.",
        "Der Verein legt fest, wer in der Plattform Vorstand, Kasse oder Moderation ist, vergibt Rollen nur an vertrauenswürdige Personen und entzieht sie, wenn sie nicht mehr gebraucht werden. Er entscheidet über Aufbewahrung und Löschung von Mitgliederunterlagen im Rahmen der gesetzlichen Fristen.",
        "Der Verein benennt der Plattform seine Ansprechperson (der Vorstand, der diesen Vertrag annimmt). Er prüft die Rechnungen und Angaben als Aussteller und ist für ihre Richtigkeit verantwortlich.",
        "Für Inhalte, die der Verein öffentlich oder für seine Mitglieder veröffentlicht (öffentliche Vereinsseite, Beiträge, Termine), ist er selbst verantwortlich. Sie sind nicht Gegenstand dieses Vertrags.",
      ],
    },
    {
      heading: "9. Unterauftragsverarbeiter",
      paragraphs: [
        "Der Verein erteilt dem Betreiber die allgemeine schriftliche Genehmigung (Art. 28 Abs. 2 DSGVO), die in Anhang 2 genannten Unterauftragsverarbeiter einzusetzen.",
        "Der Betreiber informiert den Verein mindestens 30 Tage vor einer beabsichtigten Hinzuziehung oder Ersetzung eines Unterauftragsverarbeiters, durch Mitteilung an die Kontaktadresse des Vorstands und in der Plattform. Der Verein kann innerhalb dieser Frist aus wichtigem datenschutzrechtlichem Grund in Textform widersprechen. Kommt keine Einigung zustande, kann jede Seite die Nutzung der betroffenen Funktion beenden.",
        "Der Betreiber schließt mit jedem Unterauftragsverarbeiter einen Vertrag, der ihm dieselben Datenschutzpflichten auferlegt wie dieser Vertrag, insbesondere hinreichende Garantien für geeignete technische und organisatorische Maßnahmen. Er haftet dem Verein dafür, dass der Unterauftragsverarbeiter seine Pflichten erfüllt.",
        "Keine Unterauftragsverhältnisse sind Nebenleistungen ohne Zugriff auf die Daten, zum Beispiel Telekommunikation, Post, Reinigung und Wartung ohne Datenzugriff.",
      ],
    },
    {
      heading: "10. Drittlandübermittlung",
      paragraphs: [
        "Die Verarbeitung findet in Deutschland (Hosting) und Frankreich (E-Mail-Versand) statt. Eine Übermittlung personenbezogener Daten in ein Land außerhalb der Europäischen Union und des Europäischen Wirtschaftsraums findet im Rahmen dieses Vertrags nicht statt. Der Betreiber holt vorher die Zustimmung des Vereins ein und stellt die Voraussetzungen der Art. 44 bis 49 DSGVO sicher, wenn sich das ändert.",
      ],
    },
    {
      heading: "11. Kontrollrechte und Nachweis",
      paragraphs: [
        "Der Betreiber stellt dem Verein alle Informationen zur Verfügung, die zum Nachweis der Einhaltung dieser Pflichten erforderlich sind, und ermöglicht Überprüfungen, einschließlich Inspektionen, durch den Verein oder einen von ihm beauftragten, zur Verschwiegenheit verpflichteten Prüfer. Prüfungen kündigt der Verein mit angemessener Frist (in der Regel 14 Tage) an, führt sie zu üblichen Geschäftszeiten ohne unverhältnismäßige Störung des Betriebs durch und erstattet die dabei nachweislich entstehenden angemessenen Kosten des Betreibers, wenn sie über eine Prüfung pro Jahr hinausgehen.",
        "Der Nachweis kann auch durch aktuelle Zertifikate, Prüfberichte oder die Unterlagen des Betreibers (Verzeichnis der Verarbeitungstätigkeiten, TOM-Dokumentation) erbracht werden. Der Zugriff auf Rechenzentren der Unterauftragsverarbeiter erfolgt über deren Nachweise, nicht durch Vor-Ort-Prüfung.",
        "Die Zustimmung zu diesem Vertrag wird mit Version, Textprüfsumme, Zeitpunkt und zustimmender Person nachweisbar gespeichert (ohne IP-Adresse).",
      ],
    },
    {
      heading: "12. Löschung und Rückgabe",
      paragraphs: [
        "Während der Laufzeit kann der Verein Daten selbst ändern, exportieren (Mitgliederliste, Rechnungen als CSV und PDF) und löschen. Tritt ein Mitglied aus oder löscht sein Konto, löscht der Betreiber die personenbezogenen Stammdaten der Person nach den in der Plattform festgelegten Regeln; Mitgliedsnummer, Eintritts- und Austrittsdatum und Beitragsklasse bleiben ohne Namen als Vereinsunterlage.",
        "Mit Beendigung des Vertrags oder Löschung des Vereins löscht der Betreiber die im Auftrag verarbeiteten Daten des Vereins oder gibt sie auf Verlangen heraus (Export), soweit keine gesetzliche Aufbewahrungspflicht besteht. Finalisierte Rechnungen bewahrt der Betreiber bis zum Ablauf der gesetzlichen Aufbewahrungsfristen auf (8 bis 10 Jahre, GoBD und Abgabenordnung), eingeschränkt und für den Verein nur noch lesend verfügbar, und löscht sie danach. Entwürfe werden gelöscht.",
        "Daten in Sicherungskopien werden mit dem Ablauf des Sicherungszeitraums (bis zu 14 Tage) überschrieben. Der Betreiber löscht die Daten innerhalb von 30 Tagen nach Vertragsende, mit Ausnahme der aufbewahrungspflichtigen Daten, und bestätigt das auf Verlangen in Textform.",
      ],
    },
    {
      heading: "13. Haftung",
      paragraphs: [
        "Für die Haftung gegenüber betroffenen Personen gilt Art. 82 DSGVO. Im Verhältnis der Parteien haftet der Betreiber für Schäden, die er durch Verstoß gegen diesen Vertrag oder gegen Weisungen verursacht, nach den gesetzlichen Vorschriften; die Haftungsregeln der Nutzungsbedingungen gelten ergänzend, soweit zwingendes Recht nicht entgegensteht.",
      ],
    },
    {
      heading: "14. Laufzeit, Änderungen und Schlussbestimmungen",
      paragraphs: [
        "Der Vertrag gilt für die Dauer der Nutzung der genannten Funktionen. Bei einer neuen Fassung muss der Vorstand erneut zustimmen; für die Umstellung gilt eine Übergangsfrist von 30 Tagen, in der der Verein mit der älteren akzeptierten Fassung weiterarbeiten darf. Die Zustimmung zu jeder Fassung ist nachweisbar.",
        "Dieser Vertrag geht den Nutzungsbedingungen vor, soweit es um die Verarbeitung personenbezogener Daten im Auftrag geht. Änderungen und Ergänzungen bedürfen der Textform. Es gilt deutsches Recht. Ist eine Bestimmung unwirksam, bleibt der Rest wirksam; die Parteien ersetzen die unwirksame Bestimmung durch eine, die dem Zweck am nächsten kommt.",
      ],
    },
    {
      heading: "Anhang 1: Technische und organisatorische Maßnahmen (TOM)",
      paragraphs: [
        "Die ausführliche Fassung steht im TOM-Dokument des Betreibers (docs/TOM.md) und wird dem Verein auf Anfrage zur Verfügung gestellt. Zusammenfassung:",
        "Zutrittskontrolle: Die Daten liegen in Rechenzentren des Unterauftragsverarbeiters Hetzner in Deutschland; der Betreiber selbst betreibt keine eigenen Rechenzentren. Der Zutritt dort richtet sich nach den Maßnahmen des Rechenzentrums (Zutrittskontrolle, Videoüberwachung, Protokollierung).",
        "Zugangskontrolle: Zugang zu den Servern nur per SSH mit Schlüssel (keine Passwortanmeldung, keine Root-Anmeldung), Sperre wiederholter Fehlversuche (fail2ban), automatische Sicherheitsupdates des Betriebssystems; Zugangsdaten und Schlüssel (Secrets) liegen nur auf dem Server in geschützten Dateien (Rechte 600) und nie im Quellcode; Datenbank und Zwischenspeicher sind nicht öffentlich erreichbar, sondern nur im internen Netz. Nutzerkonten sichern Passwörter mit argon2id, Sitzungen mit gehashten Token, optionaler Zwei-Faktor-Anmeldung (TOTP) und Drosselung bei Fehlversuchen.",
        "Zugriffskontrolle: Rollenbasierte Rechte im Verein (Vorstand, Kasse, Moderation, Mitglied) und bei der Plattform (Plattform-Administration nur über die Kommandozeile vergeben); Mitgliederstammdaten lesen nur Vorstand und Kasse, ändern nur der Vorstand; Anwesenheit sehen nur Vorstand und Moderation; Zugriffsprotokoll für Exporte, Rechnungsaktionen, Moderationsentscheidungen und Zustimmungen. Zugriffe von Mitarbeitenden des Betreibers auf Klartext von Chat-Nachrichten gibt es nur bei gemeldeten Nachrichten und werden protokolliert.",
        "Trennungskontrolle: Datenbereiche sind per Schema getrennt (Identität, Soziales, Chat, Abrechnung, Mitglieder, Warteliste, Vertrag, Mail); ein automatischer Test stellt sicher, dass ein Bereich nur eigene Tabellen liest. Eigene Prozesse für Webanwendung, Schnittstelle, Chat-Gateway und Hintergrundarbeit; Geheimnisse je Dienst getrennt.",
        "Pseudonymisierung und Verschlüsselung: Verschlüsselte Übertragung (TLS, HSTS); Chat-Inhalte, Beweiskopien, Zwei-Faktor-Geheimnisse und Einladungs-Token verschlüsselt gespeichert (AES-256-GCM); Passwörter, Sitzungs- und Einmal-Token nur als Hash; Adressen in Sperrlisten und Zählern als nicht umkehrbarer Hash (HMAC); Bilder ohne Metadaten und nur nach Berechtigungsprüfung ausgeliefert.",
        "Weitergabekontrolle: Übertragung nur über TLS; keine Drittanbieter-Aufrufe im Browser (strenge Inhaltsrichtlinie, keine CDN-Schriften, kein Tracking); Rechnungsmails nur mit Link, ohne Anhang; Protokolle ohne IP-Adressen, Cookies, Token und Inhalte; Export von Mitgliederlisten wird protokolliert und gegen Formel-Einschleusung abgesichert.",
        "Eingabekontrolle: Änderungen an Mitgliederdaten und Rechnungen sind einem Nutzer zugeordnet (Erfasser, Zeitpunkt); finalisierte Rechnungen sind unveränderlich (lückenloser Nummernkreis); Zustimmungen zum Vertrag lassen sich nachträglich nicht ändern (nur Anhängen, Datenbank-Sperre).",
        "Verfügbarkeitskontrolle: Sicherung der Datenbank und des Medienspeichers per Skript mit Aufbewahrung der letzten 14 Sicherungen; Skript für Wiederherstellungstests; automatischer Neustart der Dienste bei Ausfall, Zustandsprüfungen der Dienste und Messwerte (nur mit Token abrufbar).",
        "Belastbarkeit: Aufgaben in Warteschlangen mit Wiederholung bei Fehlern; Begrenzungen je Konto und je Adresse gegen Überlastung und Missbrauch; Kostenbremse für Mailversand.",
        "Datenschutz durch Technikgestaltung und Voreinstellungen: Datensparsamkeit (nur erforderliche Felder, keine E-Mail-Adressen in der Mitgliederliste, keine besonderen Kategorien), automatische Löschfristen (täglicher Aufräumjob), Auskunft und Löschung als Selbstbedienung, Austritt löscht Stammdaten, öffentliche Seiten ohne Personendaten.",
        "Überprüfung, Bewertung und Evaluierung: Automatische Tests bei jeder Änderung (Einheits-, Integrations- und Ende-zu-Ende-Tests, Abhängigkeitsprüfung); Dokumentation der Verarbeitungen und Fristen; Prozess für Datenschutzverletzungen mit 72-Stunden-Ablauf; jährliche Überprüfung dieser Maßnahmen.",
        "Organisation: Verpflichtung der Beteiligten auf Vertraulichkeit; Auftragsverarbeitungsverträge mit den Unterauftragsverarbeitern.",
      ],
    },
    {
      heading: "Anhang 2: Unterauftragsverarbeiter",
      paragraphs: [
        "1. Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Deutschland. Leistung: Hosting der Server, Datenbank, Medienspeicher und Sicherungen. Ort der Verarbeitung: Rechenzentrum in Deutschland. Betroffene Daten: alle Daten dieses Vertrags.",
        "2. Scaleway SAS, 8 rue de la Ville l'Évêque, 75008 Paris, Frankreich. Leistung: Versand von E-Mails (Transactional Email) für Einladungen, Rechnungsbenachrichtigungen und Konto-Mails. Ort der Verarbeitung: Rechenzentrum Paris, Frankreich. Betroffene Daten: Empfängeradresse, Betreff und Inhalt der Mail, Zeitpunkt (bei Einladungen auch Name der eingeladenen Person).",
        "Weitere Unterauftragsverarbeiter setzt der Betreiber für diesen Vertrag nicht ein. Push-Dienste der Browserhersteller erhalten nur Daten der jeweiligen Nutzerinnen und Nutzer, die Push aktivieren, im Rahmen des Nutzungsvertrags des Betreibers und nicht im Auftrag des Vereins.",
      ],
    },
  ],
};

/** Alle bekannten Fassungen (neueste zuletzt). Aeltere Fassungen bleiben erhalten, damit akzeptierte Texte abrufbar sind. */
export const AVV_VERSIONS: AvvDocument[] = [AVV_DOCUMENT_V1, AVV_DOCUMENT];

/** Kanonischer Text (Markdown) einer Fassung; Grundlage fuer Hash und Download. Aenderungen hier aendern alle Hashes! */
export function avvToMarkdown(doc: AvvDocument): string {
  const lines: string[] = [`# ${doc.title}`, "", `Fassung: ${doc.version} (${doc.status === "draft" ? "ENTWURF" : "final"}), Stand ${doc.publishedAt}`];
  if (doc.status === "draft") lines.push("", `> ${AVV_DRAFT_NOTICE}`);
  for (const s of doc.sections) {
    lines.push("", `## ${s.heading}`);
    for (const p of s.paragraphs) lines.push("", p);
  }
  return lines.join("\n") + "\n";
}

export type AvvAcceptanceInfo = {
  version: string;
  textHash: string;
  acceptedAt: string;
  /** Name der zustimmenden Person; null nach Kontoloeschung. */
  acceptedBy: string | null;
  /** Gilt die Zustimmung fuer die aktuelle Fassung? */
  isCurrent: boolean;
};

export type AvvStatus = {
  /** Wird die Zustimmung serverseitig erzwungen (AVV_REQUIRED)? */
  required: boolean;
  current: { version: string; textHash: string; status: "draft" | "final"; title: string; publishedAt: string };
  /** Neueste Zustimmung des Vereins (auch fuer aeltere Fassungen). */
  accepted: AvvAcceptanceInfo | null;
  /** Aktuelle Fassung zugestimmt? */
  upToDate: boolean;
  /** Sind Schreibaktionen (Mitgliederdaten, Beitraege, Rechnungen, Einladungsmails) derzeit gesperrt? */
  blocked: boolean;
  /** Bei aelterer Zustimmung: letzter Tag der Uebergangsfrist (Berliner Datum). */
  graceUntil: string | null;
  /** Darf die anfragende Person zustimmen (nur Vorstand)? */
  canAccept: boolean;
};

export const avvAcceptSchema = z.object({
  version: z.string().min(1).max(100),
  textHash: z.string().regex(/^[0-9a-f]{64}$/),
  confirm: z.literal(true),
});
export type AvvAcceptInput = z.infer<typeof avvAcceptSchema>;
