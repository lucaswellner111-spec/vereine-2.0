"use client";

import { useState, type FormEvent } from "react";
import type { MyMembership, SelfMemberProfileInput } from "@vereine/shared";
import { SettingsBackLink } from "@/components/settings-back-link";
import { Alert, ArrowLink, Button, Card, CardSkeletons, EmptyState, ErrorState, Field, PageHeader } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { useApi, useBusy } from "@/lib/use-api";
import { toast } from "@/components/ui-hosts";
import { dateDe } from "@/lib/money";

export default function MyClubDataPage() {
  const memberships = useApi<MyMembership[]>("/me/memberships");
  const list = memberships.data;
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <SettingsBackLink />
      <PageHeader title="Meine Mitgliedsdaten" subtitle="Diese Angaben sehen nur Vorstand und Kassenwart deines Vereins." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {memberships.error && !list ? (
        <ErrorState message={memberships.error} onRetry={memberships.reload} />
      ) : list === null ? (
        <CardSkeletons count={2} />
      ) : list.length === 0 ? (
        <EmptyState title="Du bist in keinem Verein Mitglied." action={<ArrowLink href="/vereine">Vereine entdecken</ArrowLink>}>
          Hier erscheinen deine Mitgliedsdaten, sobald du beigetreten bist.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">Alles ist freiwillig; dein Verein darf nur Angaben verlangen, die er für die Mitgliedschaft braucht. Beim Austritt oder Löschen deines Kontos werden sie gelöscht.</p>
          {list.map((m) => <ClubForm key={m.orgSlug} m={m} onError={setError} />)}
        </div>
      )}
    </>
  );
}

function ClubForm({ m, onError }: { m: MyMembership; onError: (e: string | null) => void }) {
  const [f, setF] = useState<Required<SelfMemberProfileInput>>(m.profile);
  const [busy, run] = useBusy();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  function save(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      onError(null);
      try {
        await api(`/orgs/${m.orgSlug}/my-profile`, { method: "PUT", body: f });
        toast.success(`Mitgliedsdaten bei ${m.orgName} gespeichert.`);
      } catch (err) {
        onError(describeError(err));
      }
    });
  }

  return (
    <Card>
      <h2 className="font-semibold">{m.orgName}</h2>
      <p className="mb-3 text-xs text-muted">Mitgliedsnr. {m.memberNo} · seit {dateDe(m.joinedOn)}{m.feeClassName && ` · Beitragsklasse ${m.feeClassName}`}</p>
      <form onSubmit={save} className="grid max-w-xl gap-3 sm:grid-cols-2">
        <Field id={`${m.orgSlug}-street`} label="Straße und Nr." maxLength={120} value={f.street} onChange={set("street")} />
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field id={`${m.orgSlug}-zip`} label="PLZ" maxLength={10} value={f.zip} onChange={set("zip")} />
          <Field id={`${m.orgSlug}-city`} label="Ort" maxLength={60} value={f.city} onChange={set("city")} />
        </div>
        <Field id={`${m.orgSlug}-phone`} label="Telefon" maxLength={30} value={f.phone} onChange={set("phone")} />
        <Field id={`${m.orgSlug}-birth`} label="Geburtsdatum" type="date" value={f.birthDate} onChange={set("birthDate")} hint="Optional, z. B. für Altersklassen." />
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" busy={busy}>Speichern</Button>
        </div>
      </form>
    </Card>
  );
}
