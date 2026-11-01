"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { MyMembership, SelfMemberProfileInput } from "@vereine/shared";
import { SettingsTabs } from "@/components/settings-tabs";
import { Alert, Button, Card, Field, PageHeader } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { dateDe } from "@/lib/money";

export default function MyClubDataPage() {
  const [list, setList] = useState<MyMembership[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<MyMembership[]>("/me/memberships").then(setList).catch((e) => setError(describeError(e)));
  }, []);

  return (
    <>
      <PageHeader title="Meine Vereinsdaten" subtitle="Diese Angaben sehen nur Vorstand und Kassenwart deines Vereins." />
      <SettingsTabs active="/einstellungen/vereinsdaten" />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {list === null ? (
        <p className="text-sm text-muted" role="status">Lade …</p>
      ) : list.length === 0 ? (
        <Card><p className="text-sm text-muted">Du bist in keinem Verein Mitglied. Hier erscheinen deine Vereinsdaten, sobald du beigetreten bist. <Link href="/vereine" className="text-brand hover:underline">Vereine entdecken →</Link></p></Card>
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
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    onError(null);
    setSaved(false);
    try {
      await api(`/orgs/${m.orgSlug}/my-profile`, { method: "PUT", body: f });
      setSaved(true);
    } catch (err) {
      onError(describeError(err));
    }
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
          <Button type="submit">Speichern</Button>
          {saved && <Alert tone="success">Gespeichert.</Alert>}
        </div>
      </form>
    </Card>
  );
}
