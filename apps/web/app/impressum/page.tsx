import type { Metadata } from "next";
import { A, LegalDocument, Mail, P } from "@/components/legal-doc";
import { isOmitted, LEGAL } from "@/lib/legal-config";

export const metadata: Metadata = { title: "Impressum", description: "Anbieterkennzeichnung nach § 5 DDG für Klubnest." };

/** Impressum nach § 5 DDG. Alle Firmendaten kommen aus lib/legal-config.ts (Platzhalter "[…]" bis zur Eintragung). */
export default function Page() {
  const l = LEGAL;
  return (
    <LegalDocument
      title="Impressum"
      updated="14. November 2026"
      intro={<P>Angaben nach § 5 Digitale-Dienste-Gesetz (DDG) für die Plattform Klubnest.</P>}
      sections={[
        {
          id: "anbieter",
          title: "Anbieter",
          body: (
            <address className="space-y-0.5 not-italic">
              <p className="font-semibold text-text">
                {l.companyName} ({l.legalForm})
              </p>
              <p>{l.street}</p>
              <p>{l.postalCity}</p>
              <p>{l.country}</p>
            </address>
          ),
        },
        {
          id: "vertretung",
          title: "Vertretung und Register",
          body: (
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[12rem_1fr]">
              <dt className="font-semibold text-text">Vertretungsberechtigt</dt>
              <dd>{l.representatives}</dd>
              <dt className="font-semibold text-text">Handelsregister</dt>
              <dd>{l.register}</dd>
              {!isOmitted(l.vatId) && (
                <>
                  <dt className="font-semibold text-text">Umsatzsteuer-ID</dt>
                  <dd>{l.vatId}</dd>
                </>
              )}
            </dl>
          ),
        },
        {
          id: "kontakt",
          title: "Kontakt",
          body: (
            <>
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[12rem_1fr]">
                <dt className="font-semibold text-text">E-Mail</dt>
                <dd>
                  <Mail address={l.email} />
                </dd>
                {!isOmitted(l.phone) && (
                  <>
                    <dt className="font-semibold text-text">Telefon</dt>
                    <dd>{l.phone}</dd>
                  </>
                )}
              </dl>
              <P>
                Du erreichst uns außerdem über die <A href="/kontakt">Kontaktseite</A>. Wir antworten so schnell wie möglich.
              </P>
            </>
          ),
        },
        {
          id: "dsa",
          title: "Kontaktstelle nach dem Digital Services Act",
          body: (
            <P>
              Behörden, Nutzerinnen und Nutzer erreichen uns für Fragen zu Inhalten und Meldungen unter <Mail address={l.dsaEmail} />, auf Deutsch und Englisch. Mehr dazu auf der Seite <A href="/meldeverfahren">Melden und DSA-Kontakt</A>.
            </P>
          ),
        },
        {
          id: "streit",
          title: "Verbraucherstreitbeilegung",
          body: (
            <P>
              Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen (§ 36 Verbraucherstreitbeilegungsgesetz).
            </P>
          ),
        },
        {
          id: "inhalte",
          title: "Inhalte von Nutzern und Vereinen",
          body: (
            <P>
              Beiträge, Kommentare, Nachrichten und Vereinsseiten stammen von den jeweiligen Nutzerinnen, Nutzern und Vereinen. Wir machen uns diese Inhalte nicht zu eigen. Hinweise auf rechtswidrige Inhalte nehmen wir über das <A href="/meldeverfahren">Meldeverfahren</A> entgegen und prüfen sie zügig.
            </P>
          ),
        },
      ]}
    />
  );
}
