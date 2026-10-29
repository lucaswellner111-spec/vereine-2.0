import { LegalPage } from "@/components/site";

export const metadata = { title: "Impressum" };

export default function Page() {
  return (
    <LegalPage title="Impressum">
      <p>Angaben nach § 5 DDG: Firmenname, Rechtsform (UG/GmbH), Anschrift, Vertretungsberechtigte, Handelsregister, USt-IdNr., Kontakt.</p>
    </LegalPage>
  );
}
