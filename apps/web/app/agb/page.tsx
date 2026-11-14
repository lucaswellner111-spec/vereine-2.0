import type { Metadata } from "next";
import { A, LegalDocument, Mail, P, Strong, UL } from "@/components/legal-doc";
import { LEGAL } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Nutzungsbedingungen",
  description: "Die Regeln für die Nutzung von Klubnest für Nutzerinnen, Nutzer und Vereine: Leistungen, Pflichten, Moderation, Haftung und Kündigung.",
};

export default function Page() {
  const l = LEGAL;
  return (
    <LegalDocument
      title="Nutzungsbedingungen"
      updated="14. November 2026"
      intro={
        <P>
          Diese Bedingungen gelten zwischen {l.companyName} ({l.legalForm}), nachfolgend „wir“, und allen, die Klubnest nutzen: Privatpersonen (Nutzer) und Vereine. Für Vereine gelten zusätzlich die Abschnitte 6 und 7.
        </P>
      }
      sections={[
        {
          id: "geltung",
          title: "Geltungsbereich und Vertragsschluss",
          body: (
            <>
              <P>
                Klubnest ist eine Plattform für Vereine, Mitglieder und Fans. Der Nutzungsvertrag kommt zustande, wenn du dich registrierst, diese Bedingungen und die <A href="/datenschutz">Datenschutzerklärung</A> bestätigst und dein Konto aktiviert wird (Bestätigung deiner E-Mail-Adresse). Abweichende Bedingungen erkennen wir nicht an.
              </P>
              <P>
                Du musst mindestens 16 Jahre alt sein und geschäftsfähig, oder die Zustimmung deiner gesetzlichen Vertreter haben. Mit der Registrierung bestätigst du dein Alter.
              </P>
            </>
          ),
        },
        {
          id: "leistung",
          title: "Unsere Leistungen",
          body: (
            <>
              <P>Wir stellen dir die folgenden Funktionen zur Verfügung, soweit sie in der App angeboten werden:</P>
              <UL>
                <li>Konto mit Profil, optional mit Zwei-Faktor-Anmeldung, Datenauskunft und Konto-Löschung</li>
                <li>Feed, Beiträge, Kommentare, Likes, Umfragen und Bilder; Folgen von Personen und Vereinen</li>
                <li>Chat mit Direktnachrichten und Gruppen, Blockieren und Melden</li>
                <li>Vereine: Gründen, Beitreten, Einladungslinks, Rollen (Vorstand, Kasse, Moderation, Mitglied), Teams</li>
                <li>Termine mit Serien, Zusagen, Warteliste, Helferlisten, Anwesenheit und Kalender-Abo</li>
                <li>Mitgliederverwaltung mit Beitragsklassen, Mitglieder-Import per CSV-Datei, Beitragsläufen und Rechnungen als PDF</li>
                <li>Öffentliche Vereinsseite und Vereinsfinder, teilbare Vorschau- und Story-Bilder</li>
                <li>Benachrichtigungen in der App, per E-Mail und per Browser-Push</li>
              </UL>
              <P>
                Wir entwickeln Klubnest weiter. Funktionen können sich ändern, hinzukommen oder entfallen, wenn das für dich zumutbar ist. Funktionen, die als „Kommt später“ gekennzeichnet sind, sind noch nicht Teil des Angebots.
              </P>
            </>
          ),
        },
        {
          id: "entgelt",
          title: "Entgelt",
          body: (
            <P>
              Die Nutzung ist derzeit kostenlos. Führen wir entgeltliche Leistungen ein, teilen wir dir Preise und Bedingungen vorher mit; ohne deine ausdrückliche Zustimmung entstehen keine Kosten.
            </P>
          ),
        },
        {
          id: "konto",
          title: "Konto und Pflichten der Nutzer",
          body: (
            <>
              <UL>
                <li>Du machst bei der Registrierung wahrheitsgemäße Angaben und hältst sie aktuell.</li>
                <li>Du hältst dein Passwort und die Notfallcodes geheim und meldest uns einen Missbrauch deines Kontos unverzüglich. Ein Konto ist nicht übertragbar.</li>
                <li>Du nutzt Klubnest nur im Rahmen der Gesetze, dieser Bedingungen und der <A href="/community-richtlinien">Community-Richtlinien</A>.</li>
                <li>Du setzt keine automatisierten Abfragen ein, die den Betrieb stören, und umgehst keine Schutzmaßnahmen und Begrenzungen.</li>
              </UL>
            </>
          ),
        },
        {
          id: "inhalte",
          title: "Deine Inhalte",
          body: (
            <>
              <P>
                Du bleibst Inhaber der Rechte an deinen Inhalten (Texte, Bilder, Nachrichten). Du räumst uns das einfache, nicht übertragbare Recht ein, sie auf Klubnest zu speichern, zu verarbeiten (zum Beispiel Bilder zu verkleinern und Metadaten zu entfernen) und so anzuzeigen, wie du es mit deinen Einstellungen bestimmst. Das Recht endet, wenn du Inhalte oder dein Konto löschst, soweit keine gesetzliche Pflicht zur Aufbewahrung besteht (zum Beispiel bei Rechnungen) und vorbehaltlich der Fristen in der Datenschutzerklärung.
              </P>
              <P>
                Du versicherst, dass du die Rechte an deinen Inhalten hast, und dass du kein Foto einer erkennbaren Person ohne deren Einwilligung (bei Kindern der Erziehungsberechtigten) einstellst, wo das Gesetz sie verlangt. Du bist für deine Inhalte verantwortlich. Wir prüfen Inhalte nicht vorab.
              </P>
            </>
          ),
        },
        {
          id: "vereine",
          title: "Zusätzlich für Vereine: Verantwortung und Rollen",
          body: (
            <>
              <P>
                Wer einen Verein gründet oder als Vorstand verwaltet, handelt für den Verein und sichert zu, dazu berechtigt zu sein. Der Verein ist unser Vertragspartner für die Vereinsfunktionen. Der Vorstand ist für die Rollenvergabe (Kasse, Moderation) verantwortlich.
              </P>
              <UL>
                <li>
                  <Strong>Datenschutz.</Strong> Für die Mitgliederverwaltung (Stammdaten, Beitragsklassen, Beitragsläufe, Rechnungen, Import, Einladungen und Rechnungsmails) ist der Verein Verantwortlicher im Sinne der DSGVO, wir sind Auftragsverarbeiter. Dafür gilt der Vertrag zur Auftragsverarbeitung, dem der Vorstand in der App unter Verwaltung zustimmt. Ohne Zustimmung können Funktionen, die Mitgliederdaten verändern oder Mails auslösen, gesperrt sein.
                </li>
                <li>
                  <Strong>Informationspflichten.</Strong> Der Verein informiert seine Mitglieder nach Art. 13 und 14 DSGVO, pflegt nur Daten, die er braucht, importiert nur eigene Mitglieder und lädt nur Personen ein, die damit rechnen. Besondere Kategorien von Daten (zum Beispiel Gesundheit) gehören nicht in Notizen oder Beiträge.
                </li>
                <li>
                  <Strong>Öffentliche Vereinsseite.</Strong> Der Vorstand schaltet sie bewusst frei und verantwortet Texte, Logo und Banner. Der Verein stellt sicher, dass er die Rechte an den Bildern hat und dass öffentliche Beiträge keine Personen ohne Einwilligung erkennbar nennen oder zeigen.
                </li>
                <li>
                  <Strong>Minderjährige.</Strong> Hat der Verein Mitglieder unter 16 Jahren, sorgt er dafür, dass diese Klubnest nur mit Zustimmung ihrer Erziehungsberechtigten nutzen; Klubnest selbst steht nur Personen ab 16 offen.
                </li>
                <li>
                  <Strong>Rechnungen.</Strong> Der Verein ist Aussteller der Rechnungen und verantwortlich für Inhalt, Steuerhinweis und Angaben. Klubnest erstellt Rechnungen als PDF-Dokument nach den Vorgaben des Vorstands und der Kasse und stellt sie dem Mitglied bereit; eine steuerliche oder rechtliche Beratung ist damit nicht verbunden. Finalisierte Rechnungen werden wegen gesetzlicher Aufbewahrungspflichten nicht gelöscht, sondern bei Konto- oder Vereinslöschung aufbewahrt und anonymisiert, soweit zulässig.
                </li>
              </UL>
            </>
          ),
        },
        {
          id: "vereinsmoderation",
          title: "Zusätzlich für Vereine: Moderation im Verein",
          body: (
            <P>
              Vorstand und Moderation eines Vereins können Beiträge und Kommentare im Verein ausblenden oder löschen, wenn sie gegen Gesetze, diese Bedingungen oder die Community-Richtlinien verstoßen. Ein Ausblenden eines Beitrags erfordert eine Begründung, die der Autor erhält. Der Verein beachtet dabei das Meldeverfahren und die Fristen der Seite <A href="/meldeverfahren">Melden und DSA-Kontakt</A>. Inhalte ohne Vereinsbezug und Chat-Meldungen prüft die Plattform-Moderation.
            </P>
          ),
        },
        {
          id: "moderation",
          title: "Moderation, Meldungen und Sperren",
          body: (
            <>
              <P>
                Wir und die Moderation der Vereine entfernen oder sperren Inhalte, die rechtswidrig sind oder gegen diese Bedingungen und die <A href="/community-richtlinien">Community-Richtlinien</A> verstoßen, und können Konten vorübergehend oder dauerhaft sperren, wenn das nach den Umständen angemessen ist (zum Beispiel bei schweren oder wiederholten Verstößen, Missbrauch oder Gefährdung anderer). Wir berücksichtigen dabei die Schwere des Verstoßes, Wiederholung, Folgen und deine berechtigten Interessen. Bei Verstößen gegen Strafgesetze können wir Behörden informieren, soweit wir dazu verpflichtet oder berechtigt sind.
              </P>
              <P>
                Wir begründen unsere Entscheidungen und zeigen dir, wie du widersprechen kannst. Das Verfahren steht auf der Seite <A href="/meldeverfahren">Melden und DSA-Kontakt</A>. Inhalte meldest du in der App am Inhalt selbst oder per E-Mail an <Mail address={l.dsaEmail} />.
              </P>
            </>
          ),
        },
        {
          id: "verfuegbarkeit",
          title: "Verfügbarkeit und Änderungen am Dienst",
          body: (
            <P>
              Wir bemühen uns um einen störungsfreien Betrieb, schulden aber keine bestimmte Verfügbarkeit. Wartungen, Störungen, Angriffe und Ausfälle von Dienstleistern können den Zugang einschränken. Wir sichern Daten regelmäßig, du solltest dennoch wichtige Inhalte (zum Beispiel Rechnungen als CSV-Datei, Datenauskunft) selbst exportieren.
            </P>
          ),
        },
        {
          id: "haftung",
          title: "Haftung",
          body: (
            <>
              <P>
                Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei der Verletzung von Leben, Körper oder Gesundheit, nach dem Produkthaftungsgesetz und soweit wir eine Garantie übernommen haben.
              </P>
              <P>
                Bei leicht fahrlässiger Verletzung einer wesentlichen Vertragspflicht (Pflicht, deren Erfüllung die ordnungsgemäße Durchführung des Vertrags erst ermöglicht und auf deren Einhaltung du regelmäßig vertrauen darfst) ist unsere Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt. Bei leicht fahrlässiger Verletzung anderer Pflichten haften wir nicht. Das gilt auch für unsere Erfüllungsgehilfen. Die gesetzliche Haftung für Datenschutzverstöße bleibt unberührt.
              </P>
              <P>
                Für Inhalte von Nutzern und Vereinen sind diese selbst verantwortlich. Unsere Haftung als Vermittlungsdienst richtet sich nach den gesetzlichen Regeln (Art. 4 bis 6 Digital Services Act); Hinweise auf rechtswidrige Inhalte prüfen wir nach dem Meldeverfahren.
              </P>
            </>
          ),
        },
        {
          id: "laufzeit",
          title: "Laufzeit und Kündigung",
          body: (
            <>
              <P>
                <Strong>Du</Strong> kannst den Vertrag jederzeit beenden, indem du dein Konto in den Einstellungen unter Datenschutz löschst oder uns schreibst. Beachte, dass du als einziger Vorstand eines Vereins mit weiteren Mitgliedern die Vorstandsrolle vorher übertragen musst; bist du das einzige aktive Mitglied, wird der Verein mit gelöscht. Wie Daten bei Löschung behandelt werden, steht in der <A href="/datenschutz">Datenschutzerklärung</A>.
              </P>
              <P>
                <Strong>Wir</Strong> können den Vertrag ordentlich mit einer Frist von 30 Tagen kündigen. Das Recht zur außerordentlichen Kündigung und zur sofortigen Sperrung aus wichtigem Grund bleibt unberührt, insbesondere bei schweren oder wiederholten Verstößen gegen diese Bedingungen. Bei Vereinen geben wir vor der Beendigung Gelegenheit, Mitglieder- und Rechnungsdaten zu exportieren, soweit uns das möglich und zumutbar ist.
              </P>
            </>
          ),
        },
        {
          id: "aenderung",
          title: "Änderung dieser Bedingungen",
          body: (
            <P>
              Wir können diese Bedingungen mit Wirkung für die Zukunft ändern, wenn ein sachlicher Grund besteht (zum Beispiel neue Funktionen, Rechtsänderungen, Missbrauchsschutz) und die Änderung für dich zumutbar ist. Wir teilen dir die Änderung mindestens 30 Tage vorher in der App oder per E-Mail mit. Sie gilt als angenommen, wenn du nicht innerhalb dieser Frist widersprichst oder Klubnest danach weiter nutzt; darauf weisen wir in der Mitteilung hin. Bei Widerspruch können beide Seiten den Vertrag zum Änderungszeitpunkt beenden. Der Vertrag zur Auftragsverarbeitung für Vereine hat eigene Regeln für neue Fassungen.
            </P>
          ),
        },
        {
          id: "schluss",
          title: "Schlussbestimmungen",
          body: (
            <>
              <P>
                Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Bist du Verbraucher, bleiben zwingende Verbraucherschutzvorschriften deines Aufenthaltsstaates unberührt. Gerichtsstand für Kaufleute, juristische Personen des öffentlichen Rechts und Vereine mit Unternehmereigenschaft ist, soweit zulässig, unser Sitz.
              </P>
              <P>
                Wir informieren dich über die Verbraucherstreitbeilegung im <A href="/impressum">Impressum</A>. Ist eine Bestimmung unwirksam, bleibt der Rest wirksam. Kontakt: <Mail address={l.email} />.
              </P>
            </>
          ),
        },
      ]}
    />
  );
}
