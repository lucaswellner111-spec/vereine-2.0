import { LegalPage } from "@/components/site";

export const metadata = { title: "Datenschutzerklärung" };

export default function Page() {
  return (
    <LegalPage title="Datenschutzerklärung">
      <p>Verantwortlicher, Zwecke und Rechtsgrundlagen, Empfänger, Speicherdauer und Betroffenenrechte werden hier beschrieben.</p>
      <p>Hosting: Hetzner Online GmbH, Deutschland. Es werden keine Tracking- oder Werbedienste von Drittanbietern eingesetzt.</p>
      <p>Deine Rechte (Auskunft, Löschung, Widerruf) kannst du direkt in den Einstellungen unter „Datenschutz“ ausüben.</p>
    </LegalPage>
  );
}
