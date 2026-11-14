import type { Metadata } from "next";
import { A, LegalDocument, Mail, P, UL } from "@/components/legal-doc";
import { LEGAL } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Barrierefreiheit",
  description: "Stand der Barrierefreiheit von Klubnest, bekannte Einschränkungen und wie du uns Barrieren meldest.",
};

export default function Page() {
  return (
    <LegalDocument
      title="Erklärung zur Barrierefreiheit"
      updated="14. November 2026"
      intro={
        <P>
          Klubnest soll für alle nutzbar sein, auch mit Sehbehinderung, ohne Maus, mit Screenreader oder auf dem Handy. Diese Erklärung beschreibt den ehrlichen Stand, nicht mehr.
        </P>
      }
      sections={[
        {
          id: "stand",
          title: "Stand der Vereinbarkeit",
          body: (
            <P>
              Wir richten Klubnest an den Web Content Accessibility Guidelines (WCAG) 2.1, Stufe AA aus (Grundlage der europäischen Norm EN 301 549). Eine vollständige Prüfung durch eine unabhängige Stelle hat noch nicht stattgefunden. Wir stufen Klubnest deshalb als <strong className="text-text">teilweise vereinbar</strong> mit diesen Anforderungen ein.
            </P>
          ),
        },
        {
          id: "getan",
          title: "Was wir tun und prüfen",
          body: (
            <UL>
              <li>Automatische Prüfung mit axe (WCAG 2.1 AA) in unseren Ende-zu-Ende-Tests auf den Kernseiten (Startseite, Anmeldung, Feed, Vereinsseite, Kalender, Einstellungen), am Desktop und in der Handy-Ansicht. Schwere und kritische Befunde lassen die Prüfung scheitern.</li>
              <li>Prüfung der Farbkontraste (WCAG AA) für das helle und das dunkle Erscheinungsbild; die Darstellung folgt auf Wunsch deinem Gerät.</li>
              <li>Bedienung mit der Tastatur: sichtbarer Fokus, Dialoge mit Fokusfalle und Schließen mit Esc, Tastenkürzel (abschaltbar).</li>
              <li>Berührungsziele von mindestens 44 Pixeln am Handy, Layout bis 375 Pixel Breite ohne seitliches Scrollen, Tabellen als Karten.</li>
              <li>Semantische Überschriften, Beschriftungen von Formularfeldern, Fehlermeldungen und Hinweise, die Screenreader vorlesen, Ansage neuer Chat-Nachrichten.</li>
              <li>Keine Abhängigkeit von Drittanbietern, die Barrieren einführen könnten (eigene Schrift, eigene Symbole).</li>
            </UL>
          ),
        },
        {
          id: "luecken",
          title: "Bekannte Einschränkungen",
          body: (
            <>
              <UL>
                <li>Bilder, die Nutzer und Vereine hochladen, haben noch keinen eigenen Alternativtext. Wir arbeiten daran, ihn bei Beiträgen ergänzen zu lassen.</li>
                <li>Die Prüfung mit Screenreadern (zum Beispiel NVDA, VoiceOver) und die Tastaturprüfung der Verwaltung, des Chats und der Profile haben wir bisher nicht vollständig manuell durchgeführt. Die automatische Prüfung findet nicht alle Probleme.</li>
                <li>Story-Kacheln werden als Bild erzeugt; ihr Inhalt steht zusätzlich als Text in der App, die Kachel selbst hat keine eigene Textalternative.</li>
                <li>Von Nutzern und Vereinen erstellte Inhalte (Text, Bilder, Dokumente) prüfen wir nicht auf Barrierefreiheit.</li>
                <li>Rechnungs-PDFs sind nicht als barrierefreie PDF-Dokumente (PDF/UA) ausgezeichnet.</li>
              </UL>
              <P>Wenn dir eine Seite nicht zugänglich ist, helfen wir dir, ohne die Barriere an die Information oder Funktion zu kommen, zum Beispiel per E-Mail oder mit einem Export deiner Daten.</P>
            </>
          ),
        },
        {
          id: "feedback",
          title: "Barriere melden und Feedback",
          body: (
            <>
              <P>
                Sag uns, wo es hakt: <Mail address={LEGAL.email} />. Bitte nenne die Seite, was du tun wolltest, und wenn du magst, deinen Browser und deine Hilfstechnik. Du kannst auch die <A href="/kontakt">Kontaktseite</A> nutzen. Wir melden uns so schnell wie möglich, in der Regel innerhalb von zwei Wochen, und sagen dir, was wir tun können.
              </P>
            </>
          ),
        },
        {
          id: "durchsetzung",
          title: "Durchsetzung und Schlichtung",
          body: (
            <P>
              Wenn du mit unserer Antwort nicht zufrieden bist, kannst du dich an die zuständige Marktüberwachungsbehörde wenden (in Deutschland die Marktüberwachungsstelle der Länder für die Barrierefreiheit von Produkten und Dienstleistungen). Für den öffentlichen Bereich gibt es die Schlichtungsstelle nach dem Behindertengleichstellungsgesetz beim Bundesbehindertenbeauftragten; sie gilt für Klubnest als privaten Anbieter nicht unmittelbar, kann aber Hinweise geben.
            </P>
          ),
        },
        {
          id: "erstellung",
          title: "Erstellung dieser Erklärung",
          body: <P>Diese Erklärung wurde am 14. November 2026 auf Grundlage unserer eigenen Prüfung erstellt und wird bei wesentlichen Änderungen angepasst.</P>,
        },
      ]}
    />
  );
}
