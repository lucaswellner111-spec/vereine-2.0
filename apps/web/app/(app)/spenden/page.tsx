import { HeartHandshake } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";

/** Platzhalter: Spenden sind noch nicht umgesetzt (keine Mock-Daten, nichts wird abgebucht). */
export default function DonatePage() {
  return (
    <>
      <PageHeader title="Spenden" />
      <EmptyState icon={HeartHandshake} title="Kommt später">
        Spenden an Vereine sind in Vorbereitung. Hier wird noch nichts abgebucht.
      </EmptyState>
    </>
  );
}
