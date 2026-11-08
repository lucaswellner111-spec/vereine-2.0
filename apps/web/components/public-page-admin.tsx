"use client";

import { Globe } from "lucide-react";
import { useEffect, useState } from "react";
import type { OrgDetail } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useApi, useBusy } from "@/lib/use-api";
import { ArrowLink, Card, CardSkeletons, ErrorState, Toggle } from "./ui";
import { CopyField } from "./ui-client";
import { ask, toast } from "./ui-hosts";

/** Oeffentliche Vereinsseite /verein/<slug> ein- und ausschalten (nur Vorstand). Standard: aus. */
export function PublicPageAdmin({ slug }: { slug: string }) {
  const org = useApi<OrgDetail>(`/orgs/${slug}`);
  const [busy, run] = useBusy();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  if (org.error && !org.data) return <ErrorState message={org.error} onRetry={org.reload} />;
  if (!org.data) return <CardSkeletons count={1} />;
  const enabled = org.data.publicPage;
  const path = `/verein/${slug}`;

  const toggle = (on: boolean) =>
    void run(async () => {
      if (
        on &&
        !(await ask(
          "Öffentliche Vereinsseite freischalten? Name, Ort, Beschreibung, Logo, Banner, Tags, die Mitgliederzahl, öffentliche Termine und die Texte der letzten Vereinsbeiträge sind dann ohne Anmeldung sichtbar – ohne Namen von Mitgliedern und ohne Beitragsbilder.",
          { confirmLabel: "Freischalten" },
        ))
      )
        return;
      try {
        org.setData(await api<OrgDetail>(`/orgs/${slug}/public-page`, { method: "PUT", body: { enabled: on } }));
        toast.success(on ? "Öffentliche Seite ist online." : "Öffentliche Seite ist ausgeschaltet.");
      } catch (e) {
        toast.error(describeError(e));
      }
    });

  return (
    <Card className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Globe size={16} aria-hidden className="text-muted" /> Öffentliche Vereinsseite
          </h2>
          <p className="mt-1 text-sm text-muted">
            Eine Seite ohne Anmeldung, z. B. für eure Webseite oder Flyer. Sie zeigt keine Mitgliedernamen, keine Autoren und keine Beitragsbilder,
            nur öffentliche Termine. Achte darauf, dass Vereinsbeiträge keine Namen oder Daten von Personen ohne deren Einverständnis enthalten.
          </p>
        </div>
        <Toggle checked={enabled} onChange={toggle} disabled={busy} label="Öffentliche Vereinsseite" />
      </div>
      {enabled && (
        <div className="mt-4 space-y-3">
          <CopyField label="Link zur öffentlichen Seite" value={`${origin}${path}`} />
          <ArrowLink href={path}>Seite ansehen</ArrowLink>
        </div>
      )}
    </Card>
  );
}
