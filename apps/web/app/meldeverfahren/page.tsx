import type { Metadata } from "next";
import { A, LegalDocument, Mail, OL, P, Strong, UL } from "@/components/legal-doc";
import { LEGAL } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Melden und DSA-Kontakt",
  description: "Rechtswidrige Inhalte melden, Entscheidungen anfechten und Kontaktstelle nach dem Digital Services Act.",
};

/** DSA: Art. 11 (Behoerden), Art. 12 (Nutzer), Art. 16 (Meldeverfahren), Art. 17 (Begruendung), Art. 20/21 (Beschwerde, Streitbeilegung). */
export default function Page() {
  const mail = LEGAL.dsaEmail;
  return (
    <LegalDocument
      title="Melden und DSA-Kontakt"
      updated="14. November 2026"
      intro={
        <P>
          Hier erfährst du, wie du Inhalte meldest, was danach passiert, wie du eine Entscheidung anfichtst und wie Behörden und Nutzer uns nach dem Digital Services Act (DSA) erreichen.
        </P>
      }
      sections={[
        {
          id: "kontaktstelle",
          title: "Kontaktstelle (Art. 11 und 12 DSA)",
          body: (
            <>
              <P>
                Die zentrale Kontaktstelle für Behörden der Mitgliedstaaten, die Europäische Kommission, das Gremium für digitale Dienste und für alle Nutzerinnen und Nutzer ist: <Mail address={mail} />.
              </P>
              <UL>
                <li>Sprachen: Deutsch und Englisch.</li>
                <li>Anbieter: {LEGAL.companyName} ({LEGAL.legalForm}), {LEGAL.street}, {LEGAL.postalCity}, {LEGAL.country}.</li>
                <li>Das ist eine E-Mail-Adresse, die wir regelmäßig lesen. Wir antworten so schnell wie möglich. Du kannst auch jederzeit direkt mit uns schreiben; ein Formular ist nicht nötig.</li>
              </UL>
            </>
          ),
        },
        {
          id: "melden",
          title: "Inhalte melden (Art. 16 DSA)",
          body: (
            <>
              <P>
                <Strong>In der App.</Strong> An Beiträgen, Kommentaren und Chat-Nachrichten gibt es die Funktion „Melden“. Du wählst einen Grund und kannst eine Notiz ergänzen. Je Person und Inhalt gibt es eine offene Meldung. Du siehst deine Meldungen in der Datenauskunft.
              </P>
              <P>
                <Strong>Per E-Mail</Strong> an <Mail address={mail} />, auch ohne Konto. Bitte gib an:
              </P>
              <OL>
                <li>Eine ausreichend begründete Erklärung, warum der Inhalt aus deiner Sicht rechtswidrig ist oder gegen unsere Regeln verstößt.</li>
                <li>Den genauen Ort des Inhalts: die Adresse (URL) der Seite, bei Beiträgen die Vereinsseite oder den Link, und wenn nötig einen Hinweis, wo er zu finden ist.</li>
                <li>Deinen Namen und deine E-Mail-Adresse (nicht nötig bei Hinweisen auf sexuellen Missbrauch von Kindern oder andere Straftaten nach Art. 3 bis 7 der Richtlinie 2011/93/EU).</li>
                <li>Die Erklärung, dass du in gutem Glauben handelst und deine Angaben richtig und vollständig sind.</li>
              </OL>
              <P>
                Wir bestätigen den Eingang einer Meldung mit E-Mail-Adresse unverzüglich. Wir prüfen jede Meldung sorgfältig, zeitnah und nicht willkürlich, durch Personen. Wir setzen keine vollautomatischen Entscheidungen über Meldungen ein. Dich als meldende Person informieren wir über unsere Entscheidung und über die Möglichkeiten, sie anzufechten.
              </P>
            </>
          ),
        },
        {
          id: "wer",
          title: "Wer entscheidet",
          body: (
            <UL>
              <li>
                <Strong>Vereinsbeiträge und Kommentare im Verein:</Strong> die Moderation des Vereins (Vorstand und Rolle „Moderation“).
              </li>
              <li>
                <Strong>Persönliche Beiträge (ohne Verein), Kommentare dazu und Chat-Nachrichten:</Strong> die Plattform-Moderation. Sie sieht Chat-Inhalte nur, wenn sie gemeldet wurden; jeder Zugriff wird protokolliert.
              </li>
            </UL>
          ),
        },
        {
          id: "folgen",
          title: "Mögliche Maßnahmen",
          body: (
            <P>
              Wir können Inhalte ausblenden oder entfernen, den Zugang zu einer Funktion einschränken oder ein Konto sperren oder beenden (siehe <A href="/agb">Nutzungsbedingungen</A> und <A href="/community-richtlinien">Community-Richtlinien</A>). Dabei berücksichtigen wir Schwere und Wiederholung des Verstoßes, die Folgen und deine Interessen, und ob eine mildere Maßnahme reicht. Gemeldete Inhalte bleiben bis zur Prüfung als Beweis erhalten, auch wenn der Beitrag gelöscht wird.
            </P>
          ),
        },
        {
          id: "begruendung",
          title: "Begründung (Art. 17 DSA)",
          body: (
            <>
              <P>Wenn wir einen Inhalt ausblenden oder entfernen, den Zugang einschränken oder ein Konto sperren, erfährst du das mit einer klaren Begründung. Sie enthält:</P>
              <UL>
                <li>die Maßnahme und, soweit sie befristet ist, ihre Dauer,</li>
                <li>die Tatsachen und Umstände, auf denen die Entscheidung beruht, und ob sie auf einer Meldung beruht,</li>
                <li>den Rechtsverstoß oder den Verstoß gegen unsere Regeln mit der Begründung,</li>
                <li>ob automatisierte Mittel beteiligt waren (derzeit nicht),</li>
                <li>wie du die Entscheidung anfichtst (Beschwerde, außergerichtliche Streitbeilegung, Gericht).</li>
              </UL>
              <P>
                Bei ausgeblendeten Beiträgen erhält der Autor die Begründung als Benachrichtigung in der App. In den übrigen Fällen (zum Beispiel entfernte Kommentare, Chat-Nachrichten, Konto-Maßnahmen) senden wir sie auf Anfrage oder per E-Mail; frag uns einfach unter <Mail address={mail} />. Wir erteilen keine Begründung, wenn wir aus Rechtsgründen daran gehindert sind, zum Beispiel auf Anordnung einer Behörde.
              </P>
            </>
          ),
        },
        {
          id: "beschwerde",
          title: "Beschwerde gegen eine Entscheidung (Art. 20 DSA)",
          body: (
            <>
              <P>
                Du kannst dich beschweren, wenn wir einen Inhalt von dir entfernt oder ausgeblendet, eine Meldung von dir abgelehnt oder dein Konto eingeschränkt oder gesperrt haben. Die Beschwerde ist kostenlos, <Strong>sechs Monate lang</Strong> nach der Entscheidung möglich und geht per E-Mail an <Mail address={mail} />. Nenne bitte die betroffene Entscheidung (Datum, Inhalt oder Konto) und warum du sie für falsch hältst.
              </P>
              <UL>
                <li>Wir bestätigen den Eingang und prüfen deine Beschwerde zeitnah, sorgfältig und nicht willkürlich.</li>
                <li>Die Entscheidung trifft eine andere Person als die, die entschieden hat, wenn das organisatorisch möglich ist; sie erfolgt nicht allein automatisiert.</li>
                <li>Wir teilen dir das Ergebnis mit Begründung mit und nehmen die Maßnahme zurück, wenn deine Beschwerde begründet ist.</li>
                <li>Beschwerden über Entscheidungen der Moderation eines Vereins prüfen wir als Plattform; der Verein wird beteiligt.</li>
              </UL>
            </>
          ),
        },
        {
          id: "streit",
          title: "Außergerichtliche Streitbeilegung (Art. 21 DSA) und Rechtsweg",
          body: (
            <P>
              Bleibt eine Streitigkeit offen, kannst du dich an eine nach Art. 21 DSA zugelassene außergerichtliche Streitbeilegungsstelle wenden (Liste der Stellen bei der zuständigen Behörde, in Deutschland die Bundesnetzagentur als Koordinator für digitale Dienste). Wir beteiligen uns an einem solchen Verfahren nach Treu und Glauben, soweit das Gesetz es verlangt oder wir uns dazu bereit erklären. Unabhängig davon steht dir der Rechtsweg offen. Du kannst dich außerdem bei der Bundesnetzagentur beschweren (Art. 53 DSA).
            </P>
          ),
        },
        {
          id: "missbrauch",
          title: "Missbrauch des Verfahrens",
          body: (
            <P>
              Wer häufig offensichtlich unbegründete Meldungen oder Beschwerden einreicht, kann von uns nach vorheriger Warnung für einen angemessenen Zeitraum von dem Verfahren ausgeschlossen werden (Art. 23 DSA).
            </P>
          ),
        },
      ]}
    />
  );
}
