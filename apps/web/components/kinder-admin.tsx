"use client";

import { Baby, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { YOUTH_AGE_LIMIT, YOUTH_AGE_MIN, YOUTH_CONSENT_TEXTS, type YouthChild } from "@vereine/shared";
import { Alert, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Field, ListSkeleton, PageHeader } from "@/components/ui";
import { Dialog } from "@/components/ui-client";
import { toast } from "@/components/ui-hosts";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { birthDateRange, NOT_STORED_ABOUT_CHILD, STORED_ABOUT_CHILD } from "@/lib/kinder";
import { useApi, useBusy } from "@/lib/use-api";

/** Erklaert verstaendlich, was zu einem Kind gespeichert wird (Elternbereich). */
export function StoredAboutChild() {
  return (
    <Card className="mb-5">
      <h2 className="text-base font-semibold">Was wir über dein Kind speichern</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        {STORED_ABOUT_CHILD.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">{NOT_STORED_ABOUT_CHILD}</p>
      <p className="mt-3 text-sm text-muted">Du kannst alle Daten jederzeit ansehen, herunterladen und löschen.</p>
    </Card>
  );
}

/** Elternuebersicht "Meine Kinder": Kinder anlegen und verwalten (Kinder haben keinen eigenen Zugang). */
export function KinderAdmin() {
  const { user } = useAuth();
  const router = useRouter();
  const list = useApi<YouthChild[]>("/guardian/children");
  const [open, setOpen] = useState(false);
  const [busy, run] = useBusy();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const range = birthDateRange();
  const verified = user?.emailVerified !== false;

  function close() {
    setOpen(false);
    setError(null);
  }

  const create = () =>
    void run(async () => {
      setError(null);
      try {
        const child = await api<YouthChild>("/guardian/children", { method: "POST", body: { firstName, lastName, birthDate, confirmGuardian: true } });
        toast.success(`${child.name} wurde angelegt.`);
        setFirstName("");
        setLastName("");
        setBirthDate("");
        setConfirmed(false);
        setOpen(false);
        router.push(`/kinder/${child.id}`);
      } catch (e) {
        setError(describeError(e));
      }
    });

  const canSubmit = firstName.trim() !== "" && lastName.trim() !== "" && birthDate !== "" && confirmed;

  return (
    <>
      <PageHeader
        title="Meine Kinder"
        subtitle={`Für Kinder von ${YOUTH_AGE_MIN} bis ${YOUTH_AGE_LIMIT - 1} Jahren. Dein Kind hat kein eigenes Login: Du verwaltest alles für dein Kind.`}
        action={
          <Button className="relative hit-area" onClick={() => setOpen(true)} disabled={!verified}>
            <Plus size={16} aria-hidden /> Kind hinzufügen
          </Button>
        }
      />
      {!verified && (
        <div className="mb-4">
          <Alert tone="info">Bestätige zuerst deine E-Mail-Adresse, dann kannst du Kinder hinzufügen.</Alert>
        </div>
      )}
      <StoredAboutChild />
      {list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.data === null ? (
        <ListSkeleton rows={2} />
      ) : list.data.length === 0 ? (
        <EmptyState emoji="🧒" title="Noch kein Kind angelegt">
          Lege dein Kind an, dann kannst du es im Verein anmelden und für Termine zu- oder absagen.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {list.data.map((c) => (
            <li key={c.id}>
              <Link href={`/kinder/${c.id}`} className="press flex min-h-14 items-center gap-3 rounded-2xl border border-border/70 bg-surface p-4 shadow-card hover:bg-surface-2">
                <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                  <Baby size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.fullName}</span>
                  <span className="block text-sm text-muted">
                    {c.age} Jahre
                    {c.orgs.length > 0 ? ` · ${c.orgs.map((o) => o.name).join(", ")}` : " · noch in keinem Verein"}
                  </span>
                </span>
                {c.paused && <Badge tone="accent">Ruht</Badge>}
                <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onClose={close}
        title="Kind hinzufügen"
        placement="sheet"
        initialFocusRef={firstRef}
        description="Wir speichern nur, was für Mitgliedschaft und Termine nötig ist."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>Abbrechen</Button>
            <Button onClick={create} busy={busy} disabled={!canSubmit}>Kind anlegen</Button>
          </div>
        }
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) create();
          }}
        >
          {error && <Alert>{error}</Alert>}
          <Field id="kind-vorname" label="Vorname" ref={firstRef} value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={40} autoComplete="off" required />
          <Field id="kind-nachname" label="Nachname" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} autoComplete="off" required hint="Auf der Plattform erscheint nur der erste Buchstabe. Der Vorstand deiner Vereine sieht den vollen Namen." />
          <Field
            id="kind-geburtsdatum"
            label="Geburtsdatum"
            type="date"
            min={range.min}
            max={range.max}
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required
            hint={`Dein Kind muss mindestens ${YOUTH_AGE_MIN} und darf höchstens ${YOUTH_AGE_LIMIT - 1} Jahre alt sein.`}
          />
          <Checkbox id="kind-sorgeberechtigt" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}>
            {YOUTH_CONSENT_TEXTS.account}
          </Checkbox>
        </form>
      </Dialog>
    </>
  );
}
