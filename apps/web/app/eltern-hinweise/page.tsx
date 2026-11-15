import type { Metadata } from "next";
import { A, LegalDocument, Mail, P, Strong, UL } from "@/components/legal-doc";
import { LEGAL } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Hinweise für Eltern",
  description: "Was Klubnest zu einem Jugendkonto speichert, was ihr als Eltern entscheidet und wie ihr Daten einseht, exportiert oder löscht.",
};

/**
 * Elterninformation zum Jugendkonto (Art. 13 DSGVO, Art. 8). Faktenbasis: docs/welle2/D2-DOKU.md, F1-DOKU.md, JUGEND-KONZEPT.md.
 * Bei inhaltlicher Aenderung YOUTH_CONSENT_VERSION (packages/shared/src/youth.ts) hochzaehlen.
 */
export default function Page() {
  return (
    <LegalDocument
      title="Hinweise für Eltern"
      updated="15. November 2026"
      intro={
        <>
          <P>
            Du legst bei Klubnest ein Jugendkonto für dein Kind an. Hier steht in einfachen Worten, was dabei passiert. Die vollständige Erklärung findest du in der <A href="/datenschutz">Datenschutzerklärung</A>, Abschnitt „Eltern- und Jugendkonten“.
          </P>
          <P>
            Bevor du bestätigst, dass du sorgeberechtigt bist und das Jugendkonto anlegst, lies bitte diese Seite. Deine Bestätigung speichern wir als Nachweis.
          </P>
        </>
      }
      sections={[
        {
          id: "was",
          title: "Was ist ein Jugendkonto?",
          body: (
            <>
              <P>
                Ein Jugendkonto ist ein Konto für ein Kind von 6 bis 15 Jahren, das du unter deinem eigenen Konto verwaltest. Dein Kind hat <Strong>keinen eigenen Zugang</Strong>: kein Passwort, keine Anmeldung, keine eigene E-Mail-Adresse. Du meldest dein Kind im Verein an, sagst für Termine zu oder ab und trägst es für Helferdienste ein. Ein Kind kann nie selbst einem Verein beitreten.
              </P>
              <P>
                Dein Kind hat kein Profil, keine Fotos, keine Chats, keine Beiträge und keinen Standort. Es taucht nicht in der Suche auf, kann nicht gefolgt und von Erwachsenen nicht angeschrieben werden.
              </P>
            </>
          ),
        },
        {
          id: "daten",
          title: "Welche Daten wir speichern",
          body: (
            <UL>
              <li>Vorname, Nachname und Geburtsdatum deines Kindes. Das Geburtsdatum dient nur der Altersprüfung. Auf der Plattform erscheinen Vorname und Initiale; der Vorstand deiner Vereine sieht den vollen Namen.</li>
              <li>Zu- und Absagen, Helferdienste und die Anwesenheit beim Training. Die Anwesenheit erfasst der Verein; einen Grund für Fehlen gibt es nicht.</li>
              <li>Rechnungen für dein Kind gehen an dich als Rechnungsempfänger und nennen den Namen deines Kindes. Rechnungen müssen wir wegen gesetzlicher Aufbewahrungspflichten aufbewahren (8 bis 10 Jahre).</li>
              <li>Einen Nachweis deiner Bestätigungen: wer wann welchen Text in welcher Fassung bestätigt oder widerrufen hat. Ohne IP-Adresse.</li>
              <li>Keine besonderen Kategorien von Daten wie Gesundheit oder Religion. Bitte schreibe solche Angaben auch nicht in Notizen.</li>
            </UL>
          ),
        },
        {
          id: "eltern",
          title: "Was du entscheidest",
          body: (
            <>
              <P>
                Mit der Anlage bestätigst du, dass du für das Kind sorgeberechtigt bist. Wir prüfen das nicht mit einem Ausweis; wir verlassen uns auf deine Angabe, deine bestätigte E-Mail-Adresse und darauf, dass der Verein dein Kind kennt. Bitte lege ein Jugendkonto nur an, wenn die Angabe stimmt.
              </P>
              <P>
                Du kannst einen zweiten Elternteil einladen (Link per Mail, 7 Tage gültig, einmalig, nur mit einem Konto mit genau der eingeladenen Adresse). Es gibt höchstens zwei Elternteile je Kind. Beide sehen und verwalten das Kind. Widerspricht einer von euch der Mitgliedschaft in einem Verein, kann der andere sie nicht allein wieder erteilen: es gilt die vorsichtigere Entscheidung. Bei einem Sorgerechtsstreit können wir nicht entscheiden, wer recht hat.
              </P>
            </>
          ),
        },
        {
          id: "rechte",
          title: "Einsehen, exportieren, löschen",
          body: (
            <UL>
              <li>Unter „Meine Kinder“ siehst du alle Daten deines Kindes und lädst sie herunter.</li>
              <li>Du kannst das Jugendkonto jederzeit löschen (mit deinem Passwort). Mit zwei Elternteilen kündigen wir die Löschung dem anderen 7 Tage vorher an; er kann widersprechen.</li>
              <li>Löschst du dein eigenes Konto und bist der letzte Elternteil, ruht das Jugendkonto und wird nach 30 Tagen gelöscht.</li>
              <li>Der Nachweis deiner Bestätigungen bleibt nach der Löschung 3 Jahre erhalten, ohne Namen (nur Kennungen), damit wir die Zustimmung bei Streit belegen können.</li>
              <li><Strong>Bis zum 16. Geburtstag.</Strong> Danach gehören die Daten deinem Kind: Einsehen, Export und Löschung durch dich sind dann nicht mehr möglich.</li>
            </UL>
          ),
        },
        {
          id: "sechzehn",
          title: "Wenn dein Kind 16 wird",
          body: (
            <P>
              30 und 7 Tage vor dem 16. Geburtstag erinnern wir dich. Am Geburtstag ruht das Jugendkonto. Dein Kind braucht dann ein eigenes Konto mit eigener E-Mail-Adresse und trifft seine Entscheidungen selbst; deine Freigaben gelten nicht automatisch weiter. Die Übernahme als eigenes Konto ist noch nicht freigeschaltet. Wird das Jugendkonto 12 Monate lang nicht übernommen, löschen wir es.
            </P>
          ),
        },
        {
          id: "verein",
          title: "Rolle des Vereins",
          body: (
            <P>
              Für die Mitgliederverwaltung ist der Verein verantwortlich; wir verarbeiten die Daten in seinem Auftrag. Lädt ein Verein dein Kind über eine Mitgliederliste ein, bekommst du die Einladung. Die Adresse deines Kindes wird nicht übernommen. Fragen zur Mitgliedschaft richtest du zuerst an den Verein.
            </P>
          ),
        },
        {
          id: "kontakt",
          title: "Fragen und Beschwerden",
          body: (
            <P>
              Bei Fragen zum Datenschutz schreib an: {LEGAL.dpoContact}. Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren, zuständig ist: {LEGAL.authority}. Allgemeine Fragen: <Mail address={LEGAL.email} />.
            </P>
          ),
        },
      ]}
    />
  );
}
