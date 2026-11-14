import type { Metadata } from "next";
import { A, LegalDocument, Mail, P, UL } from "@/components/legal-doc";
import { LEGAL } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Community-Richtlinien",
  description: "So gehen wir auf Klubnest miteinander um: erlaubt, nicht erlaubt und was bei Verstößen passiert.",
};

export default function Page() {
  return (
    <LegalDocument
      title="Community-Richtlinien"
      updated="14. November 2026"
      intro={
        <P>
          Klubnest ist ein Ort für Vereine, Mitglieder und Fans. Damit sich alle wohlfühlen, auch Kinder und Jugendliche ab 16, gelten diese Regeln. Sie ergänzen die <A href="/agb">Nutzungsbedingungen</A>.
        </P>
      }
      sections={[
        {
          id: "grundsatz",
          title: "Grundsatz",
          body: <P>Geh mit anderen so um, wie du es im Verein und auf dem Sportplatz auch tun würdest: respektvoll, ehrlich, hilfsbereit. Kritik an einer Sache ist erwünscht, Angriffe auf Personen nicht.</P>,
        },
        {
          id: "verboten",
          title: "Was nicht erlaubt ist",
          body: (
            <UL>
              <li>Beleidigung, Bedrohung, Hetze, Diskriminierung wegen Herkunft, Religion, Geschlecht, Behinderung, Alter oder sexueller Identität, Mobbing und Belästigung, auch im Chat</li>
              <li>Gewaltverherrlichung, Verbreitung von Gewaltdarstellungen und Inhalte, die zu Straftaten aufrufen oder sie verharmlosen</li>
              <li>Sexuelle Inhalte, jede Darstellung von Minderjährigen in sexualisierter Weise (wir melden das den Behörden), Nacktheit</li>
              <li>Verfassungsfeindliche Kennzeichen und Inhalte, Volksverhetzung, Terrorpropaganda</li>
              <li>Urheberrechts-, Marken- und Persönlichkeitsrechtsverletzungen, zum Beispiel fremde Fotos ohne Erlaubnis</li>
              <li>Spam, Kettenbriefe, unerwünschte Werbung, Betrug, Phishing und Schadsoftware</li>
              <li>Falsche Identität, Fake-Konten und das Ausgeben als Verein, Behörde oder Plattform</li>
              <li>Weitergabe fremder privater Daten (Adressen, Telefonnummern, Chat-Inhalte, Fotos) ohne Einwilligung, auch Vorstandsnotizen und Mitgliederlisten</li>
              <li>Falsche Meldungen, Meldungen aus Rache und der Versuch, die Moderation oder technische Begrenzungen zu umgehen</li>
            </UL>
          ),
        },
        {
          id: "personen",
          title: "Fotos und Daten anderer Personen",
          body: (
            <>
              <UL>
                <li>Stelle Fotos nur ein, wenn du sie gemacht hast oder die Rechte hast. Zeige erkennbare Personen nur mit deren Einwilligung, bei Kindern mit Einwilligung der Erziehungsberechtigten.</li>
                <li>Nenne in öffentlichen Beiträgen eines Vereins keine Personen mit Namen, wenn sie nicht zugestimmt haben.</li>
                <li>Was du als Story-Kachel teilst, verantwortest du selbst: Beitragstexte und Bilder können Personen zeigen.</li>
                <li>Schreibe keine Gesundheitsdaten, Angaben zu Religion, politischer Meinung oder Sexualleben anderer in Beiträge, Chats, Notizen oder Umfragen. Dazu gehört auch, bei „entschuldigt“ Gründe wie Krankheiten zu nennen.</li>
              </UL>
            </>
          ),
        },
        {
          id: "chat",
          title: "Chat",
          body: (
            <P>
              Im Chat gilt dasselbe. Du kannst Personen blockieren und Nachrichten melden. Gemeldete Nachrichten prüft die Plattform-Moderation. Beachte, dass der Chat nicht Ende-zu-Ende-verschlüsselt ist (siehe <A href="/datenschutz">Datenschutzerklärung</A>); teile keine Passwörter oder Zahlungsdaten.
            </P>
          ),
        },
        {
          id: "umfragen",
          title: "Umfragen",
          body: <P>Umfragen sind für Vereinsentscheidungen und Spaß gedacht. Stelle keine Umfragen zu sensiblen Themen (zum Beispiel Gesundheit, Religion, politische Haltung einzelner Personen) und keine Umfragen, die Personen bloßstellen.</P>,
        },
        {
          id: "folgen",
          title: "Was bei Verstößen passiert",
          body: (
            <>
              <P>Je nach Schwere und Wiederholung:</P>
              <UL>
                <li>Inhalte werden ausgeblendet oder entfernt. Bei ausgeblendeten Beiträgen bekommt der Autor die Begründung.</li>
                <li>Ein Konto wird vorübergehend gesperrt oder dauerhaft beendet.</li>
                <li>Bei Straftaten oder akuter Gefahr informieren wir Behörden, soweit wir dazu verpflichtet oder berechtigt sind.</li>
              </UL>
              <P>
                Über Vereinsbeiträge entscheidet zunächst die Moderation des Vereins, über alles andere die Plattform-Moderation. Alle Entscheidungen sind begründet und anfechtbar: <A href="/meldeverfahren">Melden und DSA-Kontakt</A>.
              </P>
            </>
          ),
        },
        {
          id: "melden",
          title: "Verstöße melden",
          body: (
            <P>
              In der App meldest du Beiträge, Kommentare und Chat-Nachrichten direkt am Inhalt. Sonst schreib an <Mail address={LEGAL.dsaEmail} />. Bei akuter Gefahr für Leib und Leben wende dich zuerst an die Polizei (110) oder den Notruf (112).
            </P>
          ),
        },
      ]}
    />
  );
}
