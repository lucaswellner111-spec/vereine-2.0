import type { Metadata } from "next";
import { A, DataTable, H3, LegalDocument, Mail, OL, P, Strong, UL } from "@/components/legal-doc";
import { isOmitted, LEGAL } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
  description: "Welche Daten Klubnest verarbeitet, wofür, auf welcher Rechtsgrundlage, wie lange und welche Rechte du hast.",
};

/**
 * Datenschutzerklaerung nach Art. 13/14 DSGVO. Faktenbasis: docs/DATENSCHUTZ-LAUNCH.md (Abschnitt 2).
 * Aendert sich eine Verarbeitung, muss dieser Text mit angepasst werden (Pflicht laut CLAUDE.md, Datenschutz-Merker).
 */
export default function Page() {
  const l = LEGAL;
  return (
    <LegalDocument
      title="Datenschutzerklärung"
      updated="14. November 2026"
      intro={
        <>
          <P>
            Klubnest ist eine Plattform für Vereine, Mitglieder und Fans. Wir haben sie nach den Grundsätzen der Datenschutz-Grundverordnung (DSGVO) entwickelt: so wenig Daten wie nötig, kein Tracking, keine Werbung, keine Anfragen deines Browsers an Drittanbieter.
          </P>
          <P>
            Hier steht, welche personenbezogenen Daten wir verarbeiten, wofür, auf welcher Rechtsgrundlage, wie lange, wer sie bekommt und welche Rechte du hast. Die Einstellungen zu Einwilligungen, Auskunft und Löschung findest du in der App unter Einstellungen, Datenschutz.
          </P>
        </>
      }
      sections={[
        {
          id: "verantwortlicher",
          title: "Verantwortlicher und Datenschutzkontakt",
          body: (
            <>
              <address className="space-y-0.5 not-italic">
                <p className="font-semibold text-text">
                  {l.companyName} ({l.legalForm})
                </p>
                <p>
                  {l.street}, {l.postalCity}, {l.country}
                </p>
                <p>
                  E-Mail: <Mail address={l.email} />
                  {!isOmitted(l.phone) ? <>, Telefon: {l.phone}</> : null}
                </p>
                <p>Vertreten durch: {l.representatives}</p>
              </address>
              <P>Datenschutzkontakt: {l.dpoContact}</P>
              <P>
                Das gilt für Klubnest als Plattform. Für die Mitgliederverwaltung eines Vereins ist der jeweilige Verein verantwortlich (siehe Abschnitt 2).
              </P>
            </>
          ),
        },
        {
          id: "rollen",
          title: "Unsere Rolle und die Rolle deines Vereins",
          body: (
            <>
              <P>
                <Strong>Wir sind Verantwortlicher</Strong> für dein Konto, die Anmeldung, deine Profile, Beiträge, Kommentare, den Chat, Benachrichtigungen, die Sicherheit der Plattform, die Warteliste und den Besuch der Website.
              </P>
              <P>
                <Strong>Dein Verein ist Verantwortlicher</Strong> für die Mitgliederverwaltung: Stammdaten, Beitragsklassen, Beitragsläufe, Rechnungen, Mitglieder-Import und die Einladungen und Rechnungsmails, die er über Klubnest verschickt. Wir verarbeiten diese Daten nur im Auftrag und nach Weisung des Vereins (Art. 28 DSGVO, Vertrag zur Auftragsverarbeitung). Anfragen dazu richtest du bitte zuerst an deinen Verein; wir leiten sie an ihn weiter, wenn du dich an uns wendest.
              </P>
              <P>
                Für Inhalte, die ein Verein öffentlich oder für seine Mitglieder veröffentlicht (Vereinsseite, Beiträge, Termine), ist der Verein inhaltlich verantwortlich. Wir stellen die technische Plattform bereit.
              </P>
            </>
          ),
        },
        {
          id: "besuch",
          title: "Besuch der Website ohne Konto",
          body: (
            <>
              <P>
                Du kannst die Startseite, die Warteliste, die öffentlichen Vereinsseiten, den Vereinsfinder, Hilfe und Rechtstexte ohne Konto besuchen. Dabei passiert Folgendes.
              </P>
              <H3>Server-Protokolle</H3>
              <P>
                Unser Webserver (Caddy) protokolliert bei jedem Aufruf technisch notwendige Angaben: IP-Adresse, Datum und Uhrzeit, aufgerufener Pfad, Statuscode und Browserkennung. Das dient der Sicherheit und Stabilität (Angriffsabwehr, Fehlersuche). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am sicheren Betrieb). Die Protokolle werden automatisch rotiert und überschrieben und liegen in der Regel nicht länger als 14 Tage vor. Die Protokolle unserer Anwendung (API) enthalten dagegen nur Methode und bereinigten Pfad: keine IP-Adressen, keine Cookies, keine Zugangsdaten, keine Inhalte aus Adressen wie Einladungs- oder Kalenderlinks.
              </P>
              <H3>Zugriffsbegrenzung je IP-Adresse</H3>
              <P>
                Um Missbrauch zu verhindern, begrenzen wir die Anfragen an die öffentlichen Bereiche (Vereinsseiten, Vereinsfinder, Bilder) je IP-Adresse, derzeit auf 60 Aufrufe je Minute für Seiten und 600 je Minute für Bilder. Der Zähler liegt im Arbeitsspeicher (Redis), enthält die IP-Adresse nur im Schlüssel und läuft nach 60 Sekunden ab. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO.
              </P>
              <H3>Keine Drittanbieter</H3>
              <P>
                Schriften, Symbole und alle Programme liefern wir selbst aus. Dein Browser nimmt beim Seitenaufruf keinen Kontakt zu Servern anderer Anbieter auf. Wir setzen keine Analyse-, Werbe- oder Tracking-Dienste ein. Links zu anderen Seiten (zum Beispiel der Kartenlink zu OpenStreetMap bei einem Termin) laden nichts vorab; erst wenn du darauf klickst, öffnet sich die fremde Seite, für die deren Datenschutzerklärung gilt.
              </P>
            </>
          ),
        },
        {
          id: "konto",
          title: "Konto, Anmeldung und Sicherheit",
          body: (
            <>
              <P>
                <Strong>Konto.</Strong> Zur Registrierung brauchen wir deinen Namen, deine E-Mail-Adresse und ein Passwort (wir speichern nur einen gesicherten Hash mit argon2id, nie das Passwort selbst). Außerdem bestätigst du, dass du mindestens 16 Jahre alt bist und die Nutzungsbedingungen und diese Erklärung zur Kenntnis genommen hast. Wir speichern, wann und in welcher Fassung du das bestätigt hast, als Nachweis (Art. 7 Abs. 1 DSGVO). Rechtsgrundlage für das Konto ist der Nutzungsvertrag (Art. 6 Abs. 1 lit. b DSGVO).
              </P>
              <P>
                <Strong>E-Mail-Bestätigung.</Strong> Nach der Registrierung schicken wir einen Bestätigungslink. Ohne Bestätigung ist keine Anmeldung möglich, und das Konto wird nach 7 Tagen gelöscht. Auch für „Passwort vergessen“ und den Wechsel der E-Mail-Adresse nutzen wir einmalige Links. Wir speichern davon nur einen Hash, den Zweck und den Ablauf (Bestätigung 24 Stunden, Passwort zurücksetzen 1 Stunde, Adresswechsel 24 Stunden). Abgelaufene oder eingelöste Einträge löschen wir nach 7 Tagen.
              </P>
              <P>
                <Strong>Sitzungen.</Strong> Nach der Anmeldung speichern wir einen Hash des Sitzungstokens, eine grobe Gerätebeschreibung und den Ablauf. Eine Sitzung gilt 30 Tage; abgelaufene Sitzungen werden stündlich gelöscht. In deinen Einstellungen kannst du Sitzungen beenden. Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO (Vertrag und Sicherheit).
              </P>
              <P>
                <Strong>Zwei-Faktor-Anmeldung (freiwillig).</Strong> Wenn du sie einschaltest, speichern wir dein TOTP-Geheimnis verschlüsselt und Hashes der Notfallcodes. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (Sicherheit deines Kontos). Beim Ausschalten oder mit dem Konto werden die Daten gelöscht.
              </P>
              <P>
                <Strong>Schutz vor Missbrauch.</Strong> Gegen das Erraten von Passwörtern zählen wir Fehlversuche je Kombination aus E-Mail-Adresse und IP-Adresse sowie je E-Mail-Adresse (10 Fehlversuche sperren 15 Minuten). Zusätzlich begrenzen wir die Zahl von Aktionen je Konto (zum Beispiel Vereine gründen, Beiträge, Kommentare, Meldungen, Chat-Nachrichten). Die Zähler enthalten E-Mail-Adresse und IP-Adresse nur als Hash, liegen im Arbeitsspeicher und laufen automatisch ab, spätestens nach 30 Tagen. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.
              </P>
              <P>
                <Strong>Einwilligungen.</Strong> Zustimmungen und Widerrufe (zum Beispiel zum personalisierten Feed) speichern wir mit Zweck, Ja oder Nein, Fassung und Zeitpunkt, nur zum Anhängen und mit dem Konto. Rechtsgrundlage ist die gesetzliche Nachweispflicht (Art. 7 Abs. 1 DSGVO).
              </P>
              <P>
                <Strong>Zugriffsprotokoll.</Strong> Bestimmte sicherheitsrelevante Aktionen halten wir fest (zum Beispiel Moderationsentscheidungen, der Zugriff von Plattform-Moderation auf gemeldete Chat-Nachrichten, Rechnungsaktionen, Exporte der Mitgliederliste, Zustimmung zum Vertrag zur Auftragsverarbeitung). Das Protokoll enthält Aktion, Zeitpunkt und Nutzer-ID, aber keine Inhalte. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (Sicherheit und Nachweis), für Rechnungsaktionen lit. c. Fristen siehe Abschnitt 17.
              </P>
            </>
          ),
        },
        {
          id: "profil",
          title: "Profil, Beiträge, Kommentare, Bilder und Feed",
          body: (
            <>
              <P>
                <Strong>Profil.</Strong> Du wählst einen Benutzernamen (Handle) und kannst freiwillig eine Kurzbeschreibung, einen Ort und ein Profilbild angeben. Dein Profil ist öffentlich (für angemeldete Nutzer sichtbar) oder privat; bei einem privaten Profil sehen Personen, die dir nicht folgen dürfen, weder Beschreibung noch Ort. Rechtsgrundlage: Nutzungsvertrag und deine freiwilligen Angaben (Art. 6 Abs. 1 lit. b, a DSGVO). Du kannst sie jederzeit ändern oder entfernen.
              </P>
              <P>
                <Strong>Beiträge, Kommentare, Likes, Umfragen.</Strong> Inhalte, die du veröffentlichst, speichern wir mit Autor und Zeitpunkt. Wer sie sieht, bestimmen Verein, Profil-Einstellung und Beitragsart. Bei Umfragen speichern wir deine Stimme mit deiner Nutzer-ID; angezeigt werden immer nur Zahlen und deine eigene Wahl, nie Namen. Beim Bearbeiten eines Beitrags wird der alte Text überschrieben, angezeigt wird nur der Hinweis „bearbeitet“. Rechtsgrundlage: Nutzungsvertrag (Art. 6 Abs. 1 lit. b DSGVO).
              </P>
              <P>
                <Strong>Bilder.</Strong> Hochgeladene Bilder werden auf dem Server neu kodiert; dabei entfernen wir alle Metadaten (zum Beispiel Aufnahmeort aus EXIF). Das Original speichern wir nicht. Bilder liefern wir nur nach Anmeldung und Prüfung der Sichtbarkeit aus; Logo und Banner eines freigeschalteten Vereins sind öffentlich.
              </P>
              <P>
                <Strong>Feed und Personalisierung.</Strong> Dein Feed enthält Beiträge deiner Vereine und der Personen, denen du folgst. Nur wenn du einwilligst (Einstellungen, Datenschutz), ordnen wir ihn nach deinem bisherigen Verhalten (Likes, „Weniger davon“, Interaktionen der letzten 30 Tage). Ohne Einwilligung ist der Feed nicht personalisiert. Du kannst die Einwilligung jederzeit widerrufen; danach nutzen wir diese Daten nicht mehr dafür. Rechtsgrundlage: Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Es gibt keine Entscheidung allein durch Automatisierung mit rechtlicher oder ähnlich erheblicher Wirkung für dich (Art. 22 DSGVO).
              </P>
              <P>
                <Strong>Löschen.</Strong> Löschst du einen Beitrag, leeren wir Text, Tags und Bilder sofort; der Rest (Kommentare, Likes, Umfrage) wird nach 30 Tagen endgültig entfernt. Liegt zu dem Beitrag eine offene Meldung vor, bleibt er bis zur Prüfung als Beweis erhalten, danach gilt die 30-Tage-Frist.
              </P>
            </>
          ),
        },
        {
          id: "chat",
          title: "Chat",
          body: (
            <>
              <P>
                Wir speichern Nachrichten, Unterhaltungen und Teilnehmer, damit der Chat funktioniert (Art. 6 Abs. 1 lit. b DSGVO). Nachrichten werden auf dem Server verschlüsselt gespeichert (AES-256-GCM, mit getrennten Schlüsseln). Das ist <Strong>keine Ende-zu-Ende-Verschlüsselung</Strong>: Der Server kann Nachrichten zur Auslieferung, für die Auskunft und für Meldungen entschlüsseln. Wir lesen Chats nicht routinemäßig. Auf eine Nachricht, die du oder jemand anderes meldet, kann die Plattform-Moderation zugreifen; jeder solche Zugriff wird protokolliert.
              </P>
              <P>
                Standardmäßig löschen wir Nachrichten nach 365 Tagen; Gruppen können eine andere Frist wählen (1 bis 3650 Tage). Wer ein Mitglied blockiert, sieht die Liste der eigenen Blockierungen in den Einstellungen und kann sie aufheben. Mitglieder einer Unterhaltung sehen die Profilbilder der anderen Teilnehmer, auch wenn ein Profil privat ist. Beim Austritt aus einem Verein entfernen wir dich aus allen Gruppen des Vereins; Direktchats bleiben bestehen.
              </P>
              <P>
                Eine gemeldete Nachricht sichern wir als verschlüsselte Beweiskopie mit Grund, Melder und Absender (Art. 6 Abs. 1 lit. c und f DSGVO, Art. 16 DSA). Sie bleibt bis zur Prüfung und danach 30 Tage ab Erledigung erhalten, auch wenn die Nachricht gelöscht wird; Löschwünsche gehen insoweit nicht vor (Art. 17 Abs. 3 lit. e DSGVO). Löscht die meldende Person ihr Konto, wird eine offene Meldung anonymisiert.
              </P>
              <P>
                Chat-Benachrichtigungen per Push zeigen nur „Neue Nachricht“, ohne Absender und Inhalt.
              </P>
            </>
          ),
        },
        {
          id: "vereine",
          title: "Vereine, Mitgliedschaft, Termine und Mitgliederverwaltung",
          body: (
            <>
              <P>
                <Strong>Vereinsmitgliedschaft und Rollen.</Strong> Wir speichern, in welchen Vereinen du Mitglied bist oder denen du folgst, und welche Rolle du hast (Vorstand, Kasse, Moderation, Mitglied). Rechtsgrundlage: Nutzungsvertrag (Art. 6 Abs. 1 lit. b DSGVO).
              </P>
              <P>
                <Strong>Einladungen.</Strong> Einladungslinks speichern wir als Hash, zusätzlich verschlüsselt, damit der Vorstand den Link erneut anzeigen kann (jeder Abruf wird protokolliert). Wir löschen sie 30 Tage nach Ablauf oder Widerruf.
              </P>
              <P>
                <Strong>Termine, Teams und Zusagen.</Strong> Titel, Ort, Zeit und deine Zusage, Absage oder Warteliste-Position pro Termin. Aktive Mitglieder sehen bei internen oder Team-Terminen Namen und Profilbilder der Zugesagten (höchstens 12 Bilder, der Rest als Zahl); bei öffentlichen Terminen nur die Anzahl. Ist ein Termin voll, rückt die Person mit dem frühesten Eintrag nach und wird benachrichtigt. Rechtsgrundlage: Vereinszweck und Nutzungsvertrag (Art. 6 Abs. 1 lit. b DSGVO), hilfsweise lit. f (Planung, wer kommt). Mit Absage, Austritt oder Kontolöschung verschwinden die Einträge.
              </P>
              <P>
                <Strong>Helferlisten.</Strong> Dienste eines Termins mit Eintragung je Person. Namen und Bilder der Eingetragenen sehen nur aktive Mitglieder, andere nur die Zahl belegter Plätze. Austritt löscht die Eintragungen künftiger Termine.
              </P>
              <P>
                <Strong>Anwesenheit.</Strong> Vorstand und Moderation eines Vereins können erfassen, wer an einem Termin da war, gefehlt hat oder entschuldigt war. Wir speichern bewusst keinen Grund und keinen Freitext. Die Einträge sehen nur Vorstand und Moderation (und du in deiner Datenauskunft). Wir löschen sie 24 Monate nach der Erfassung, beim Austritt sofort. Rechtsgrundlage: Vereinszweck (Art. 6 Abs. 1 lit. b DSGVO), hilfsweise lit. f.
              </P>
              <P>
                <Strong>Mitgliederverwaltung (im Auftrag deines Vereins).</Strong> Der Vorstand kann Stammdaten pflegen: Anschrift, Telefon, Geburtsdatum, Eintritt und Austritt, Mitgliedsnummer, Beitragsklasse, bei Minderjährigen Angaben zu Erziehungsberechtigten, eine interne Notiz. Vorstand und Kasse lesen, nur der Vorstand ändert; du siehst und änderst deine eigenen Daten selbst. Beim Austritt löschen wir Anschrift, Telefon, Geburtsdatum, Erziehungsberechtigte und Notiz; Mitgliedsnummer, Eintritts- und Austrittsdatum und Beitragsklasse bleiben als Vereinsunterlage ohne Namen. Verantwortlich ist dein Verein (Abschnitt 2).
              </P>
              <P>
                <Strong>Mitglieder-Import.</Strong> Der Vorstand kann eine CSV-Datei mit Vorname, Nachname, E-Mail-Adresse und optional Mitgliedsnummer, Eintrittsdatum und Beitragsklasse hochladen. Weitere Spalten verwerfen wir, die Datei speichern wir nicht. Die Personen erhalten eine persönliche Einladung und werden erst mit ihrer Annahme Mitglied. Bis dahin liegen ihre Angaben als Vormerkung vor; sie werden mit der Annahme sofort gelöscht, sonst 30 Tage nach Versand der Einladung bzw. 60 Tage nach dem Import, wenn nie versendet wurde. Der Verein ist Verantwortlicher und muss die Personen nach Art. 13 und 14 DSGVO informieren. Wenn du eine solche Einladung erhältst, ohne sie zu erwarten, kannst du dich über den Abmeldelink in der Mail abmelden; wir senden dir dann keine Einladungen mehr.
              </P>
              <P>
                <Strong>Beitragsläufe und Rechnungen.</Strong> Der Vorstand oder die Kasse erstellt Beitragsrechnungen an Mitglieder mit Name, Anschrift (falls hinterlegt) und Beträgen und den Angaben des Vereins als Aussteller (Name, Anschrift, Bankverbindung, Steuerhinweis) als festgeschriebene Kopie. Ein Rechnungs-PDF kann einen Zahlungs-QR-Code (GiroCode) mit Name und IBAN des Vereins, Betrag und Rechnungsnummer enthalten, den wir lokal erzeugen. Rechnungen unterliegen gesetzlichen Aufbewahrungspflichten (Art. 6 Abs. 1 lit. c DSGVO, 8 bis 10 Jahre); bei Löschung deines Kontos werden sie anonymisiert, nicht gelöscht. Verantwortlich ist dein Verein, wir handeln im Auftrag.
              </P>
              <P>
                <Strong>Vertrag zur Auftragsverarbeitung.</Strong> Wenn der Vorstand dem Vertrag mit uns zustimmt, speichern wir Verein, Fassung, Prüfsumme, die zustimmende Person und den Zeitpunkt (Art. 28 Abs. 3 DSGVO, Art. 6 Abs. 1 lit. c und f). Löschst du dein Konto, bleibt der Nachweis ohne deinen Namen bestehen.
              </P>
            </>
          ),
        },
        {
          id: "oeffentlich",
          title: "Öffentliche Vereinsseiten und Teilen",
          body: (
            <>
              <P>
                Ein Verein kann seine Seite freischalten. Sie ist dann ohne Login unter <A href="/vereine-finden">Vereine finden</A> und in der Vereinsadresse sichtbar und zeigt: Name, Kategorie, Ort, Beschreibung, Tags, Logo und Banner, Mitgliederzahl, öffentliche Termine (Titel, Art, Zeit, Ort) und die Texte der letzten 10 Vereinsbeiträge mit Datum und Tags. Wir zeigen dort keine Namen von Mitgliedern oder Autoren, keine Profilbilder, keine Beitragsbilder, keine Kommentare oder Likes und keine internen Termine. Verantwortlich für die Inhalte ist der Verein; Rechtsgrundlage ist sein berechtigtes Interesse an der Außendarstellung (Art. 6 Abs. 1 lit. f DSGVO). Ausgeblendete oder gelöschte Beiträge verschwinden sofort. Antworten werden bis zu 60 Sekunden zwischengespeichert. Texte von Vereinsbeiträgen können Personen nennen; wir weisen Vereine darauf hin, das zu unterlassen.
              </P>
              <P>
                Vorschaubilder für geteilte Links erzeugen wir bei jedem Abruf aus den öffentlichen Angaben und speichern sie nicht. Teilbare Story-Kacheln (Termin, Vereinsbeitrag) entstehen nur in deinem Browser; sie werden nicht zu uns hochgeladen. Was du teilst, verantwortest du selbst.
              </P>
            </>
          ),
        },
        {
          id: "mail",
          title: "E-Mails",
          body: (
            <>
              <P>Wir verschicken folgende E-Mails:</P>
              <UL>
                <li>
                  <Strong>Notwendige Nachrichten zum Konto</Strong> (Bestätigung, Passwort zurücksetzen, Adresswechsel samt Hinweis an die alte Adresse, „Konto existiert schon“): Art. 6 Abs. 1 lit. b DSGVO.
                </li>
                <li>
                  <Strong>Tägliche Sammelmail</Strong> mit Anzahlen deiner neuen Benachrichtigungen (ohne Namen und Inhalte): nur mit deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), jederzeit per Link in der Mail (ein Klick) oder in den Einstellungen abbestellbar. Wir speichern, ob sie an ist, seit wann und den letzten Versand.
                </li>
                <li>
                  <Strong>Einladungen und Rechnungsbenachrichtigungen</Strong>, die ein Verein über Klubnest auslöst: im Auftrag des Vereins. Der Verein stützt Einladungen an eine Adresse außerhalb von Klubnest auf sein berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO); jede Einladung enthält einen Abmeldelink. Rechnungsmails enthalten nur einen Link, kein PDF.
                </li>
              </UL>
              <P>
                Für Likes versenden wir keine E-Mails. Der Versand läuft über einen Auftragsverarbeiter (Scaleway TEM, Frankreich, siehe „Empfänger und Auftragsverarbeiter“). Bis zum Versand liegt die Aufgabe in einer Warteschlange und wird danach sofort entfernt. Unsere Protokolle enthalten dazu nur Vorlage, Domain des Empfängers und Ergebnis, nie die Adresse oder den Inhalt. Wir messen keine Öffnungen und keine Klicks.
              </P>
              <P>
                <Strong>Sperrliste und Kostenbremse.</Strong> Damit Abmeldungen und unzustellbare Adressen beachtet werden, speichern wir einen nicht umkehrbaren Hash der Adresse mit Bereich, Grund und Datum (bei unzustellbaren Adressen oder Beschwerden 12 Monate, bei Abmeldungen von Einladungen 36 Monate; Rechtsgrundlage Art. 6 Abs. 1 lit. c und f DSGVO). Zum Schutz vor Missbrauch und Kosten zählen wir Mails je Adresse (als Hash), Nutzer, Verein, IP-Adresse (nur bei „Passwort vergessen“ und Bestätigung) und insgesamt im Arbeitsspeicher; die Zähler laufen nach Stunde, Tag oder Monat ab.
              </P>
            </>
          ),
        },
        {
          id: "push",
          title: "Benachrichtigungen und Push",
          body: (
            <>
              <P>
                <Strong>In der App.</Strong> Benachrichtigungen (zum Beispiel neuer Kommentar, neuer Follower, Termin geändert) speichern wir mit Art, Kurzangaben (etwa Name und Textauszug der handelnden Person) und Zeitpunkt, 180 Tage lang. Löscht die auslösende Person ihr Konto, verschwinden Benachrichtigungen mit ihrem Namen bei allen Empfängern. Rechtsgrundlage: Nutzungsvertrag (Art. 6 Abs. 1 lit. b DSGVO).
              </P>
              <P>
                <Strong>Browser-Push (freiwillig).</Strong> Nur wenn du im Browser die Berechtigung erteilst, speichern wir die Adresse (Endpunkt) und die Schlüssel deines Geräts und die Browserkennung, höchstens 10 Geräte je Konto. Wir senden dann Kurznachrichten (ohne Nutzerinhalte, Chat ohne Absender und Inhalt) verschlüsselt an den Push-Dienst deines Browserherstellers (zum Beispiel Google, Mozilla, Apple oder Microsoft), der sie an dein Gerät weiterleitet. Dabei erfährt dieser Dienst deine Geräteadresse, den Zeitpunkt und die Größe der Nachricht, nicht den Inhalt. Rechtsgrundlage: Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du in den Browser-Einstellungen oder bei uns jederzeit widerrufen kannst. Wir löschen die Abos bei Abmeldung oder wenn der Dienst sie als ungültig meldet.
              </P>
            </>
          ),
        },
        {
          id: "warteliste",
          title: "Warteliste",
          body: (
            <>
              <P>
                Wenn du dich auf die Warteliste einträgst, speichern wir deine E-Mail-Adresse und freiwillig Rolle, Region, Vereinsname und ein Stichwort, woher du kommst (zum Beispiel Flyer, nur Statistik), außerdem die Fassung des Einwilligungstextes sowie Zeitpunkt der Eintragung und der Bestätigung. Wir schicken dir eine Bestätigungsmail (Double-Opt-in); gespeichert wird nur ein Hash des Links. Zweck: dich per E-Mail über den Start und Neuigkeiten von Klubnest informieren. Rechtsgrundlage: deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die wir mit dem Double-Opt-in nachweisen.
              </P>
              <P>
                Unbestätigte Einträge löschen wir nach 7 Tagen. Bestätigte Einträge speichern wir bis zu deinem Widerruf: Ein Klick auf den Austragelink in jeder Mail löscht Adresse und Angaben sofort; wir behalten nur einen nicht umkehrbaren Hash der Adresse in der Sperrliste (36 Monate), damit du nicht ungewollt wieder angeschrieben wirst. Nach dem Start von Klubnest prüfen wir den Bestand und löschen Einträge, die wir nicht mehr brauchen, spätestens sechs Monate nach dem Start. Zur Missbrauchsabwehr zählen wir Anmeldungen je Adresse und IP-Adresse (nur Hash, im Arbeitsspeicher). Die Antwort auf eine Anmeldung ist immer gleich, damit niemand erfahren kann, wer eingetragen ist. Die Auswertung (Zählung nach Rolle, Region, Quelle) und Exporte sind auf Plattform-Administratoren beschränkt und werden protokolliert.
              </P>
            </>
          ),
        },
        {
          id: "kalender",
          title: "Kalender-Abo",
          body: (
            <P>
              Wenn du ein Kalender-Abo einrichtest, erzeugen wir einen geheimen Link; gespeichert wird nur ein Hash. Der Kalender zeigt genau die Termine, die du ohnehin siehst. Ein neuer Link macht den alten ungültig, du kannst ihn jederzeit abschalten. Teile den Link nicht, denn wer ihn kennt, sieht die Termine. Rechtsgrundlage: Nutzungsvertrag (Art. 6 Abs. 1 lit. b DSGVO).
            </P>
          ),
        },
        {
          id: "moderation",
          title: "Meldungen und Moderation",
          body: (
            <P>
              Wenn du einen Beitrag, Kommentar oder eine Chat-Nachricht meldest, speichern wir den Bezug, deinen Grund, eine optionale Notiz und deine Nutzer-ID. Pro Person und Inhalt gibt es nur eine offene Meldung. Rechtsgrundlage: Art. 6 Abs. 1 lit. c DSGVO in Verbindung mit Art. 16 des Digital Services Act und lit. f (Schutz der Community). Meldungen verschwinden mit dem gemeldeten Beitrag oder deinem Konto; bei Chat-Meldungen gilt Abschnitt 6. Moderationsentscheidungen halten wir im Zugriffsprotokoll fest (Aktion, Beteiligte, keine Inhalte). Mehr dazu auf der Seite <A href="/meldeverfahren">Melden und DSA-Kontakt</A>.
            </P>
          ),
        },
        {
          id: "speicher",
          title: "Cookies und lokaler Speicher",
          body: (
            <>
              <P>
                Wir setzen nur technisch notwendige Speicherungen ein. Dafür ist keine Einwilligung nötig (§ 25 Abs. 2 Nr. 2 TDDDG). Es gibt keine Cookies für Werbung, Analyse oder Tracking.
              </P>
              <DataTable
                caption="Cookies und lokaler Speicher"
                head={["Name", "Art", "Zweck", "Dauer"]}
                rows={[
                  ["sid", "Cookie (HttpOnly, SameSite=Lax, bei HTTPS Secure)", "Deine Anmeldung (Sitzung)", "bis 30 Tage oder Abmeldung"],
                  ["theme", "Lokaler Speicher", "Gewählte Darstellung (hell, dunkel, automatisch)", "bis du den Speicher löschst"],
                  ["klubnest.shortcuts", "Lokaler Speicher", "Einstellung Tastenkürzel", "bis du den Speicher löschst"],
                  ["verwaltung-org", "Lokaler Speicher", "Zuletzt gewählter Verein in der Verwaltung", "bis du den Speicher löschst"],
                  ["klubnest.nachBestaetigung", "Lokaler Speicher", "Zielseite nach der E-Mail-Bestätigung", "kurzlebig, wird nach Gebrauch entfernt"],
                ]}
              />
              <P>
                Außerdem registriert der Browser bei Bedarf einen Service Worker, der Push-Nachrichten empfängt und einen Offline-Hinweis zeigt. Angemeldete Inhalte speichert er nicht zwischen.
              </P>
            </>
          ),
        },
        {
          id: "empfaenger",
          title: "Empfänger und Auftragsverarbeiter",
          body: (
            <>
              <P>Wir geben Daten nur weiter, wenn es für den Betrieb nötig ist oder du eingewilligt hast. Es gibt keine Weitergabe zu Werbezwecken und keinen Verkauf von Daten.</P>
              <DataTable
                caption="Empfänger und Auftragsverarbeiter"
                head={["Empfänger", "Zweck", "Sitz und Ort der Verarbeitung"]}
                rows={[
                  ["Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen", "Hosting: Server, Datenbank, Speicher, Sicherungen (Auftragsverarbeiter)", "Deutschland (Rechenzentrum in Deutschland)"],
                  ["Scaleway SAS, 8 rue de la Ville l’Évêque, 75008 Paris", "Versand von E-Mails (Auftragsverarbeiter)", "Frankreich (Rechenzentrum Paris)"],
                  ["Push-Dienste der Browserhersteller (zum Beispiel Google, Mozilla, Apple, Microsoft)", "Zustellung von Push-Nachrichten, nur wenn du Push aktivierst (eigene Verantwortliche)", "je nach Browser, siehe „Übermittlung in Drittländer“"],
                  ["Dein Verein", "Mitgliederverwaltung und Vereinsinhalte, soweit du Mitglied bist (Abschnitt 2)", "-"],
                  ["Andere Nutzerinnen und Nutzer", "Sichtbarkeit nach deinen Einstellungen (Profil, Beiträge, Zusagen, Chat)", "-"],
                  ["Behörden und Gerichte", "nur bei gesetzlicher Pflicht oder zur Durchsetzung von Rechten", "-"],
                ]}
              />
              <P>
                Mit Hetzner und Scaleway bestehen oder werden vor Aufnahme der jeweiligen Verarbeitung Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO abgeschlossen. Die Liste der Unterauftragsverarbeiter, die Vereine im Vertrag zur Auftragsverarbeitung sehen, ist mit dieser Liste identisch.
              </P>
            </>
          ),
        },
        {
          id: "drittland",
          title: "Übermittlung in Drittländer",
          body: (
            <>
              <P>
                Unsere Server stehen in Deutschland, der E-Mail-Versand läuft in Frankreich. Wir übermitteln keine personenbezogenen Daten in Länder außerhalb der EU und des EWR.
              </P>
              <P>
                Eine Besonderheit gilt für Browser-Push (siehe „Benachrichtigungen und Push“, nur mit deiner Einwilligung): Der Push-Dienst deines Browserherstellers ist ein eigener Dienst, dessen Betreiber ihren Sitz außerhalb der EU haben können (zum Beispiel USA). Wir senden ihm nur die verschlüsselte Kurznachricht und die Geräteadresse. Wenn du das nicht möchtest, aktiviere Push nicht; alle anderen Funktionen bleiben nutzbar.
              </P>
            </>
          ),
        },
        {
          id: "fristen",
          title: "Speicherdauer im Überblick",
          body: (
            <>
              <P>Wir löschen Daten, sobald der Zweck entfällt, spätestens zu diesen Zeitpunkten. Die Löschung läuft automatisch (täglicher Aufräumjob). Gesetzliche Aufbewahrungspflichten gehen vor.</P>
              <DataTable
                caption="Speicherfristen"
                head={["Daten", "Frist"]}
                rows={[
                  ["Konto und alle Inhalte", "bis zur Löschung des Kontos (auf Wunsch sofort)"],
                  ["Unbestätigte Registrierung", "7 Tage"],
                  ["Sitzungen", "30 Tage"],
                  ["Einmal-Links per E-Mail (Bestätigung, Passwort)", "7 Tage nach Ablauf oder Einlösung"],
                  ["Benachrichtigungen", "180 Tage"],
                  ["Chat-Nachrichten", "365 Tage (je Gruppe 1 bis 3650 Tage einstellbar)"],
                  ["Gemeldete Chat-Nachricht (Beweiskopie)", "bis zur Prüfung, danach 30 Tage"],
                  ["Gelöschte Beiträge", "30 Tage (bei offener Meldung bis zur Prüfung)"],
                  ["Anwesenheit", "24 Monate ab Erfassung"],
                  ["Einladungslinks", "30 Tage nach Ablauf oder Widerruf"],
                  ["Mitglieder-Import (Vormerkung)", "bis zur Annahme; sonst 30 Tage nach Versand, nie versendet 60 Tage"],
                  ["Zugriffsprotokoll", "12 Monate; Moderation 24 Monate; Rechnungsaktionen 10 Jahre"],
                  ["Rechnungen und Beitragsläufe", "gesetzliche Aufbewahrung (8 bis 10 Jahre), nach Kontolöschung anonymisiert"],
                  ["Sperrliste E-Mail (Hash)", "Unzustellbar oder Beschwerde 12 Monate; Abmeldung 36 Monate"],
                  ["Warteliste", "unbestätigt 7 Tage; bestätigt bis Widerruf, spätestens sechs Monate nach dem Start von Klubnest"],
                  ["Server-Protokolle", "in der Regel höchstens 14 Tage"],
                  ["Sicherungskopien", "bis zu 14 Tage; in dieser Zeit können bereits gelöschte Daten noch in Sicherungen liegen und werden danach überschrieben"],
                ]}
              />
            </>
          ),
        },
        {
          id: "sicherheit",
          title: "Sicherheit",
          body: (
            <P>
              Wir schützen Daten unter anderem durch verschlüsselte Übertragung (TLS, HSTS), eine strenge Inhaltsrichtlinie (CSP), gesicherte Passwörter (argon2id), optionale Zwei-Faktor-Anmeldung, verschlüsselten Chat-Speicher, rollenbasierte Zugriffe, getrennte Datenbereiche, Entfernen von Bildmetadaten, regelmäßige Sicherungen und Zugriffsprotokolle. Keine Methode ist vollkommen sicher; wir verbessern sie laufend. Bei einer Verletzung des Schutzes personenbezogener Daten melden wir sie, soweit gesetzlich vorgeschrieben, der Aufsichtsbehörde und den Betroffenen.
            </P>
          ),
        },
        {
          id: "rechte",
          title: "Deine Rechte",
          body: (
            <>
              <P>Du hast gegenüber uns, soweit wir verantwortlich sind, folgende Rechte:</P>
              <UL>
                <li>
                  <Strong>Auskunft</Strong> (Art. 15 DSGVO) und <Strong>Datenübertragbarkeit</Strong> (Art. 20): In den Einstellungen unter Datenschutz lädst du alle deine Daten als JSON-Datei herunter, deine Bilder als ZIP-Datei (je 5 Mal pro Stunde).
                </li>
                <li>
                  <Strong>Berichtigung</Strong> (Art. 16): Profil und Angaben änderst du selbst; sonst schreib uns.
                </li>
                <li>
                  <Strong>Löschung</Strong> (Art. 17): In den Einstellungen unter Datenschutz löschst du dein Konto selbst. Ist dein Verein darauf angewiesen, dass du als einziger Vorstand die Rolle vorher übergibst, weisen wir dich darauf hin. Rechnungen bleiben anonymisiert erhalten (gesetzliche Pflicht).
                </li>
                <li>
                  <Strong>Einschränkung</Strong> (Art. 18) und <Strong>Widerspruch</Strong> (Art. 21): Soweit wir Daten wegen berechtigter Interessen verarbeiten, kannst du aus Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit widersprechen. Wir hören dann auf, es sei denn, wir weisen zwingende schutzwürdige Gründe nach oder die Verarbeitung dient der Verteidigung von Rechtsansprüchen.
                </li>
                <li>
                  <Strong>Widerruf einer Einwilligung</Strong> (Art. 7 Abs. 3): jederzeit mit Wirkung für die Zukunft, zum Beispiel für den personalisierten Feed, die Sammelmail, Push oder die Warteliste. Die Rechtmäßigkeit der Verarbeitung bis dahin bleibt unberührt.
                </li>
              </UL>
              <P>
                Für Daten, die dein Verein verantwortet (Mitgliederverwaltung), wende dich bitte zuerst an deinen Verein. Du kannst dich aber auch an uns wenden; wir unterstützen den Verein bei der Antwort. Anfragen richtest du an: {l.dpoContact}. Wir antworten innerhalb eines Monats (Art. 12 Abs. 3 DSGVO). Zum Schutz deiner Daten können wir einen Identitätsnachweis verlangen, zum Beispiel eine Anfrage von deiner Konto-Adresse.
              </P>
              <P>
                <Strong>Beschwerderecht.</Strong> Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), insbesondere in dem Mitgliedstaat, in dem du lebst oder arbeitest oder in dem der Verstoß geschah. Für uns zuständig ist: {l.authority}.
              </P>
            </>
          ),
        },
        {
          id: "pflicht",
          title: "Pflicht zur Bereitstellung",
          body: (
            <P>
              Für ein Konto brauchst du Name, E-Mail-Adresse und Passwort; ohne sie können wir den Nutzungsvertrag nicht erfüllen. Alle anderen Angaben (Profil, Ort, Bild, Mitgliedsdaten) sind freiwillig. Ob ein Verein von dir bestimmte Mitgliedsdaten verlangt, entscheidet der Verein.
            </P>
          ),
        },
        {
          id: "kinder",
          title: "Kinder und Jugendliche",
          body: (
            <P>
              Klubnest richtet sich an Personen ab 16 Jahren; bei der Registrierung bestätigst du dein Alter. Wenn wir erfahren, dass ein Konto von einer jüngeren Person ohne Zustimmung der Eltern angelegt wurde, löschen wir es. Eltern können sich jederzeit an uns wenden. Vereine mit minderjährigen Mitgliedern sind verantwortlich dafür, dass sie die Zustimmung der Erziehungsberechtigten einholen, wo das Gesetz sie verlangt; ein Verein kann Angaben zu Erziehungsberechtigten in der Mitgliederverwaltung hinterlegen. Wir erfassen keine besonderen Kategorien von Daten (zum Beispiel Gesundheitsdaten) und bitten Vereine und Nutzer, solche Angaben nicht in Notizen, Beiträgen oder Chats abzulegen.
            </P>
          ),
        },
        {
          id: "aenderungen",
          title: "Änderungen dieser Erklärung",
          body: (
            <>
              <P>
                Wir passen diese Erklärung an, wenn sich Funktionen oder Rechtslage ändern. Das Datum oben zeigt den Stand. Bei wesentlichen Änderungen informieren wir dich in der App oder per E-Mail.
              </P>
              <OL>
                <li>Aktuelle Fassung: 14. November 2026 (Version 2026-11-14).</li>
              </OL>
            </>
          ),
        },
      ]}
    />
  );
}
