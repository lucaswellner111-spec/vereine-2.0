import type { Metadata } from "next";
import type { ReactNode } from "react";
import { A, Faq, LegalDocument, Mail, OL, P, UL } from "@/components/legal-doc";
import { LEGAL } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Hilfe",
  description: "Antworten auf häufige Fragen zu Klubnest: Konto, Vereine, Termine, Chat, Datenschutz und Verwaltung.",
};

function Group({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}

/** Hilfe und FAQ. Nur Funktionen beschreiben, die es gibt (Pfade wie in der App: Einstellungen, Verwaltung). */
export default function Page() {
  return (
    <LegalDocument
      title="Hilfe"
      updated="14. November 2026"
      intro={
        <P>
          Schnelle Antworten zu Klubnest. Findest du nichts, schreib uns über die <A href="/kontakt">Kontaktseite</A>.
        </P>
      }
      sections={[
        {
          id: "start",
          title: "Erste Schritte",
          body: (
            <Group>
              <Faq q="Wie registriere ich mich?">
                <OL>
                  <li>
                    Öffne <A href="/registrieren">Registrieren</A> und gib Name, E-Mail-Adresse und Passwort an.
                  </li>
                  <li>Bestätige, dass du mindestens 16 Jahre alt bist, und stimme den Nutzungsbedingungen und der Datenschutzerklärung zu.</li>
                  <li>Wir senden dir einen Bestätigungslink. Erst danach kannst du dich anmelden. Der Link gilt 24 Stunden; nicht bestätigte Konten löschen wir nach 7 Tagen.</li>
                </OL>
              </Faq>
              <Faq q="Die Bestätigungsmail kommt nicht an.">
                <P>Schau im Spam-Ordner nach und prüfe die Schreibweise deiner Adresse. Registriere dich danach noch einmal mit derselben Adresse: Du bekommst eine neue Mail. Aus Sicherheitsgründen sagen wir dir nicht, ob eine Adresse schon registriert ist.</P>
              </Faq>
              <Faq q="Ich habe mein Passwort vergessen.">
                <P>
                  Auf der Anmeldeseite gibt es „Passwort vergessen“. Wir senden einen Link, der eine Stunde gilt und nur einmal funktioniert. Beim Festlegen eines neuen Passworts werden alle anderen Sitzungen beendet.
                </P>
              </Faq>
              <Faq q="Wie schütze ich mein Konto besser?">
                <P>Wähle ein langes, einmaliges Passwort und schalte unter Einstellungen, Sicherheit die Zwei-Faktor-Anmeldung ein (Authenticator-App). Bewahre die Notfallcodes sicher auf. Dort kannst du auch aktive Sitzungen beenden.</P>
              </Faq>
              <Faq q="Gibt es Klubnest als App?">
                <P>Klubnest läuft im Browser und lässt sich auf Handy und Computer als App zum Startbildschirm hinzufügen. Push-Nachrichten gibt es nur, wenn du sie im Browser erlaubst (Einstellungen, Mitteilungen).</P>
              </Faq>
            </Group>
          ),
        },
        {
          id: "vereine",
          title: "Vereine und Mitgliedschaft",
          body: (
            <Group>
              <Faq q="Wie finde ich einen Verein?">
                <P>
                  Über <A href="/vereine-finden">Vereine finden</A> (auch ohne Konto) oder die Suche in der App. Vereine, die ihre Seite freigeschaltet haben, zeigen dort Beschreibung, Termine und aktuelle Beiträge. Du kannst einem Verein folgen, um seine Beiträge zu sehen, oder über „Mitglied werden“ einen Mitgliedsantrag stellen.
                </P>
              </Faq>
              <Faq q="Wie werde ich Mitglied?">
                <P>Mit einem Einladungslink oder QR-Code des Vorstands trittst du direkt bei. Sonst stellst du einen Mitgliedsantrag, den der Vorstand annimmt. Hat dein Verein dich per Import eingeladen, nimmst du die persönliche Einladung in der Mail an; erst dann wirst du Mitglied.</P>
              </Faq>
              <Faq q="Wie gründe ich einen Verein auf Klubnest?">
                <P>Mit bestätigter E-Mail-Adresse unter Vereine, „Neu“. Du wirst Vorstand. Danach hilft dir die Liste „Erste Schritte“ in der Verwaltung (Tags, Einladung, Termin, Beitrag, Vereinsdaten, Beitragsklassen). Du kannst bis zu 10 Vereine am Tag anlegen.</P>
              </Faq>
              <Faq q="Wie trete ich aus einem Verein aus?">
                <P>
                  Auf der Vereinsseite in der App mit „Austreten“. Beim Austritt löschen wir Team-Mitgliedschaften, Anwesenheitseinträge, Helferdienste künftiger Termine, Zusagen zu künftigen internen Terminen und deine Mitgliedsstammdaten (Anschrift, Telefon, Geburtsdatum). Die Mitgliedsnummer, Ein- und Austrittsdatum und Beitragsklasse bleiben ohne Namen als Vereinsunterlage.
                </P>
              </Faq>
              <Faq q="Was sehen andere Mitglieder von mir?">
                <P>
                  Das hängt von deinem Profil ab (öffentlich oder privat, Einstellungen, Profil) und vom Verein. Bei Terminen sehen aktive Mitglieder, wer zugesagt hat; bei öffentlichen Terminen nur die Anzahl. Anwesenheit sehen nur Vorstand und Moderation.
                </P>
              </Faq>
            </Group>
          ),
        },
        {
          id: "inhalte",
          title: "Beiträge, Termine und Chat",
          body: (
            <Group>
              <Faq q="Wie sage ich bei einem Termin zu? Was ist die Warteliste?">
                <P>Öffne den Termin und wähle Zusage, Vielleicht oder Absage. Hat der Termin ein Teilnehmerlimit und ist er voll, trägst du dich auf die Warteliste ein. Wird ein Platz frei, rückt die Person mit dem frühesten Eintrag automatisch nach und wird benachrichtigt.</P>
              </Faq>
              <Faq q="Wie trage ich mich als Helfer ein?">
                <P>Bei Terminen mit Helferliste siehst du die Dienste mit freien Plätzen und trägst dich ein. Eintragen können sich aktive Mitglieder, bei Team-Terminen nur das Team.</P>
              </Faq>
              <Faq q="Wie bekomme ich die Termine in meinen Kalender?">
                <P>Unter Einstellungen, Kalender erzeugst du einen geheimen Abo-Link für dein Kalenderprogramm. Er zeigt genau die Termine, die du auch in Klubnest siehst. Teile den Link nicht; mit „Neuen Link erzeugen“ machst du den alten ungültig.</P>
              </Faq>
              <Faq q="Kann ich Beiträge bearbeiten oder löschen?">
                <P>Ja, eigene Beiträge. Bearbeitete Beiträge zeigen „bearbeitet“, ein früherer Text wird nicht aufgehoben. Gelöschte Beiträge sind sofort weg; der Rest wird nach 30 Tagen endgültig entfernt. Solange eine Meldung offen ist, kannst du den Beitrag nicht bearbeiten.</P>
              </Faq>
              <Faq q="Wie funktioniert der Chat? Ist er verschlüsselt?">
                <P>
                  Nachrichten sind auf dem Server verschlüsselt gespeichert, aber nicht Ende-zu-Ende-verschlüsselt. Direktnachrichten gehen unter Mitgliedern eines Vereins oder an den Vorstand eines Vereins, dem du folgst. Gruppen legen Vorstand oder Moderation an. Du kannst Personen blockieren und Nachrichten melden. Standardmäßig löschen wir Nachrichten nach 365 Tagen.
                </P>
              </Faq>
              <Faq q="Ich habe etwas Unangemessenes gesehen.">
                <P>
                  Melde es direkt am Beitrag, Kommentar oder an der Chat-Nachricht. Wie es weitergeht, steht unter <A href="/meldeverfahren">Melden und DSA-Kontakt</A>. Die Regeln findest du in den <A href="/community-richtlinien">Community-Richtlinien</A>.
                </P>
              </Faq>
              <Faq q="Wie nutze ich Umfragen und Stories?">
                <P>Umfragen legst du beim Schreiben eines Beitrags an (Ende höchstens 90 Tage später). Es zeigen sich nur Zahlen, nie Namen. Story-Kacheln zu Terminen und Vereinsbeiträgen erzeugt dein Browser lokal; du teilst sie über das Teilen-Menü deines Geräts oder lädst sie herunter.</P>
              </Faq>
            </Group>
          ),
        },
        {
          id: "mitteilungen",
          title: "Benachrichtigungen und E-Mails",
          body: (
            <Group>
              <Faq q="Wie schalte ich Push ein oder aus?">
                <P>Unter Einstellungen, Mitteilungen aktivierst du Push für dieses Gerät. Der Browser fragt nach der Erlaubnis. Ausschalten geht dort oder in den Browser-Einstellungen. Push-Nachrichten enthalten nur Kurztexte.</P>
              </Faq>
              <Faq q="Wie bestelle ich die tägliche Sammelmail ab?">
                <P>Mit dem Link in der Mail (ein Klick) oder unter Einstellungen, Mitteilungen. Die Sammelmail gibt es nur mit deiner Einwilligung.</P>
              </Faq>
              <Faq q="Ich bekomme eine Einladung von einem Verein, den ich nicht kenne.">
                <P>Du musst nichts tun. Über den Abmeldelink in der Mail erhältst du keine Einladungen mehr. Schreib uns, wenn du glaubst, dass deine Adresse missbraucht wurde.</P>
              </Faq>
            </Group>
          ),
        },
        {
          id: "daten",
          title: "Deine Daten und dein Konto",
          body: (
            <Group>
              <Faq q="Wie lade ich meine Daten herunter?">
                <P>Unter Einstellungen, Datenschutz, „Daten herunterladen“ erhältst du alle deine Daten als JSON-Datei, deine Bilder als ZIP-Datei. Beides ist je 5 Mal pro Stunde möglich.</P>
              </Faq>
              <Faq q="Wie lösche ich mein Konto?">
                <P>
                  Unter Einstellungen, Datenschutz, „Konto löschen“. Du bestätigst mit deinem Passwort. Das Konto wird sofort gesperrt und die Daten werden gelöscht oder anonymisiert. Rechnungen bleiben wegen der Aufbewahrungspflicht anonymisiert erhalten. Bist du einziger Vorstand eines Vereins mit weiteren Mitgliedern, übergib zuerst die Vorstandsrolle; bist du das einzige Mitglied, wird der Verein mit gelöscht (exportiere vorher die Rechnungen als CSV).
                </P>
              </Faq>
              <Faq q="Welche Daten speichert Klubnest über mich?">
                <P>
                  Alles Wichtige steht in der <A href="/datenschutz">Datenschutzerklärung</A>. Wir setzen keine Werbe- und Tracking-Dienste ein.
                </P>
              </Faq>
              <Faq q="Ich habe die E-Mail-Adresse gewechselt.">
                <P>Unter Einstellungen, Sicherheit kannst du die Adresse ändern. Wir senden einen Link an die neue und einen Hinweis an die alte Adresse. Erst mit der Bestätigung gilt die neue.</P>
              </Faq>
            </Group>
          ),
        },
        {
          id: "verwaltung",
          title: "Für Vorstände und Kassenwarte",
          body: (
            <Group>
              <Faq q="Wer darf was in der Verwaltung?">
                <UL>
                  <li>Vorstand: alles, auch Rollen, Mitgliederdaten ändern, Import, Einladungen, Vertrag zur Auftragsverarbeitung.</li>
                  <li>Kasse: Mitglieder und Beiträge lesen, Beitragsklassen, Rechnungen, Vereinsdaten.</li>
                  <li>Moderation: Termine und Moderation (Meldungen, Beiträge, Kommentare), Anwesenheit.</li>
                </UL>
              </Faq>
              <Faq q="Wie importiere ich meine Mitglieder?">
                <OL>
                  <li>Verwaltung, Mitglieder: CSV-Datei hochladen (höchstens 500 Zeilen, 1 MB; Vorname, Nachname, E-Mail, optional Mitgliedsnummer, Eintritt, Beitragsklasse).</li>
                  <li>Vorschau prüfen. Dabei wird nichts gespeichert.</li>
                  <li>Bestätigen, dass du die Personen informiert hast. Sie bekommen eine persönliche Einladung per Mail und werden erst mit Annahme Mitglied.</li>
                </OL>
                <P>Du darfst nur Personen importieren, die mit einer Einladung rechnen. Dein Verein ist dafür verantwortlich. Es gelten Limits (100 Einladungsmails je Verein und Tag, der Rest geht am nächsten Morgen).</P>
              </Faq>
              <Faq q="Wie erstelle ich Beitragsrechnungen?">
                <P>Unter Verwaltung, Beiträge startest du einen Beitragslauf: Zeitraum, Fälligkeit und Beitragsklassen wählen, Vorschau ansehen, Lauf starten. Es entstehen Entwürfe. Erst wenn du sie finalisierst, bekommen Mitglieder die Rechnung und eine Benachrichtigung. Unter Verwaltung, Rechnungen gibt es auch das PDF und den CSV-Export. Prüfe Name und Anschrift der Entwürfe vor dem Finalisieren, besonders wenn jemand nach dem Lauf ausgetreten ist.</P>
              </Faq>
              <Faq q="Was ist der Vertrag zur Auftragsverarbeitung?">
                <P>
                  Weil dein Verein für die Mitgliederdaten verantwortlich ist und wir sie in seinem Auftrag verarbeiten, braucht ihr einen Vertrag nach Art. 28 DSGVO. Der Vorstand stimmt ihm unter Verwaltung, Vertrag zur Auftragsverarbeitung zu. Dort steht auch die Liste der Unterauftragsverarbeiter. Ohne Zustimmung können Funktionen mit Mitgliederdaten gesperrt sein.
                </P>
              </Faq>
              <Faq q="Wie schalte ich die öffentliche Vereinsseite frei?">
                <P>Unter Verwaltung, Vereinsdaten. Dort siehst du, was öffentlich wird: Name, Ort, Beschreibung, Logo und Banner, Mitgliederzahl, öffentliche Termine und die Texte der letzten 10 Beiträge, keine Namen von Personen. Du verantwortest die Inhalte und Bildrechte.</P>
              </Faq>
              <Faq q="Ich habe Mitglieder unter 16.">
                <P>Klubnest steht Personen ab 16 offen. Für jüngere Mitglieder können Eltern ein eigenes Konto nutzen oder ihr nutzt Klubnest nur mit Zustimmung der Erziehungsberechtigten. Stammdaten von Minderjährigen kannst du mit Angaben zu Erziehungsberechtigten pflegen. Prüft bitte die Anforderungen an Einwilligung und Information im Verein.</P>
              </Faq>
            </Group>
          ),
        },
        {
          id: "kontakt",
          title: "Nicht gefunden?",
          body: (
            <P>
              Schreib uns an <Mail address={LEGAL.email} /> oder über die <A href="/kontakt">Kontaktseite</A>. Nenne bitte nie dein Passwort.
            </P>
          ),
        },
      ]}
    />
  );
}
