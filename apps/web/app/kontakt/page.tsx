import type { Metadata } from "next";
import { A, LegalDocument, Mail, P, UL } from "@/components/legal-doc";
import { isOmitted, LEGAL } from "@/lib/legal-config";

export const metadata: Metadata = { title: "Kontakt", description: "So erreichst du das Klubnest-Team: allgemeine Fragen, Datenschutz, Meldungen und Barrierefreiheit." };

export default function Page() {
  const l = LEGAL;
  return (
    <LegalDocument
      title="Kontakt"
      updated="14. November 2026"
      intro={<P>Schreib uns einfach. Bitte nenne in deiner Nachricht nie dein Passwort und keine Zugangscodes, wir fragen nie danach.</P>}
      sections={[
        {
          id: "allgemein",
          title: "Fragen und Feedback",
          body: (
            <>
              <P>
                Für Fragen zur Nutzung, Ideen und Probleme: <Mail address={l.email} />. Vorab hilft oft die <A href="/hilfe">Hilfe</A>.
              </P>
              {!isOmitted(l.phone) && <P>Telefon: {l.phone}</P>}
              <P>
                Wenn du ein Problem mit deinem Konto meldest, schreib bitte von der E-Mail-Adresse, mit der du bei Klubnest registriert bist. So können wir dir helfen, ohne dass Fremde an deine Daten kommen.
              </P>
            </>
          ),
        },
        {
          id: "datenschutz",
          title: "Datenschutz und Betroffenenrechte",
          body: (
            <>
              <P>
                Für Auskunft, Berichtigung, Löschung, Widerspruch und alle anderen Fragen zum Datenschutz: {l.dpoContact}.
              </P>
              <P>
                Auskunft und Löschung kannst du auch selbst erledigen: in der App unter Einstellungen, Datenschutz. Mehr in der <A href="/datenschutz">Datenschutzerklärung</A>.
              </P>
            </>
          ),
        },
        {
          id: "meldungen",
          title: "Rechtswidrige Inhalte und Beschwerden",
          body: (
            <P>
              Inhalte melden oder eine Moderationsentscheidung anfechten: <Mail address={l.dsaEmail} />. Die Schritte stehen auf der Seite <A href="/meldeverfahren">Melden und DSA-Kontakt</A>. In der App meldest du Beiträge, Kommentare und Chat-Nachrichten direkt am Inhalt.
            </P>
          ),
        },
        {
          id: "barrierefreiheit",
          title: "Barrierefreiheit",
          body: (
            <P>
              Wenn dir etwas nicht zugänglich ist, schreib an <Mail address={l.email} />. Details auf der Seite <A href="/barrierefreiheit">Barrierefreiheit</A>.
            </P>
          ),
        },
        {
          id: "vereine",
          title: "Für Vereine",
          body: (
            <UL>
              <li>
                Fragen zum Vertrag zur Auftragsverarbeitung: <Mail address={l.email} />, Stichwort „AVV“. Den Vertrag findest du in der App unter Verwaltung, Vertrag zur Auftragsverarbeitung.
              </li>
              <li>
                Noch nicht dabei? Trag dich auf der <A href="/warteliste">Warteliste</A> ein.
              </li>
            </UL>
          ),
        },
        {
          id: "post",
          title: "Postanschrift",
          body: (
            <address className="space-y-0.5 not-italic">
              <p>
                {l.companyName} ({l.legalForm})
              </p>
              <p>{l.street}</p>
              <p>
                {l.postalCity}, {l.country}
              </p>
            </address>
          ),
        },
      ]}
    />
  );
}
