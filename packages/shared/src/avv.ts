import { z } from "zod";

/**
 * Vertrag zur Auftragsverarbeitung (AVV, Art. 28 DSGVO) zwischen Verein (Verantwortlicher) und Betreiber (Auftragsverarbeiter).
 *
 * ENTWURF: Der Text ist ein PLATZHALTER. Der rechtlich gueltige Wortlaut kommt vom Anwalt/Datenschutzbeauftragten
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

export const AVV_DOCUMENT: AvvDocument = {
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

/** Alle bekannten Fassungen (neueste zuletzt). Aeltere Fassungen bleiben erhalten, damit akzeptierte Texte abrufbar sind. */
export const AVV_VERSIONS: AvvDocument[] = [AVV_DOCUMENT];

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
