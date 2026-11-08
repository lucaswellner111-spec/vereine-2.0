"use client";

import { useState } from "react";
import { FeeRunAdmin } from "@/components/fee-run-admin";
import { FeeClassesAdmin } from "@/components/members-admin";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function BeitraegePage() {
  // Aenderungen an Beitragsklassen laden die Klassen im Beitragslauf neu (und verwerfen dessen Vorschau)
  const [classesVersion, setClassesVersion] = useState(0);
  return (
    <VerwaltungPage id="beitraege">
      {(c) => (
        <div className="space-y-8">
          <FeeClassesAdmin slug={c.slug} canEdit={c.role === "admin"} onError={c.onError} onChanged={() => setClassesVersion((v) => v + 1)} />
          <FeeRunAdmin slug={c.slug} classesVersion={classesVersion} />
        </div>
      )}
    </VerwaltungPage>
  );
}
