"use client";

import { Download, LogOut, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { YOUTH_AGE_LIMIT, YOUTH_DELETION_NOTICE_DAYS, type DeleteChildResult, type RsvpStatus, type YouthChildDetail, type YouthEvent } from "@vereine/shared";
import { KindGuardians } from "@/components/kind-guardians";
import { StoredAboutChild } from "@/components/kinder-admin";
import { Alert, ArrowLink, BackLink, Badge, Button, Card, EmptyState, ErrorState, Field, ListSkeleton, PageHeader, SectionTitle } from "@/components/ui";
import { Dialog, SegmentedControl } from "@/components/ui-client";
import { ask, toast } from "@/components/ui-hosts";
import { downloadJson } from "@/lib/download";
import { api, describeError } from "@/lib/api";
import { ATTENDANCE_LABEL, RSVP_OPTIONS, RSVP_STATUS_LABEL } from "@/lib/events";
import { CONSENT_LABEL, inviteTokenFrom, orgSlugFrom } from "@/lib/kinder";
import { dateDe } from "@/lib/money";
import { useApi, useBusy } from "@/lib/use-api";

const dateTime = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Einzelnes Kind: Vereine, Termine mit Zu-/Absage und Helferdiensten, Freigaben, Daten. Alles handeln die Eltern. */
export function KindDetail({ id }: { id: string }) {
  const child = useApi<YouthChildDetail>(`/guardian/children/${id}`);
  const router = useRouter();
  const [busy, run] = useBusy();
  const [joinOpen, setJoinOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const guardians = useApi<{ guardians: unknown[] }>(`/guardian/children/${id}/guardians`);
  const twoGuardians = (guardians.data?.guardians.length ?? 1) > 1;

  if (child.error && !child.data) {
    return (
      <>
        <BackLink href="/kinder">Meine Kinder</BackLink>
        <ErrorState message={child.errorStatus === 404 ? "Dieses Kind gibt es nicht (mehr)." : child.error} onRetry={child.reload} />
      </>
    );
  }
  const c = child.data;
  if (!c) return <ListSkeleton rows={4} />;

  const rsvp = (e: YouthEvent, status: RsvpStatus) =>
    void run(async () => {
      try {
        await api(`/guardian/children/${id}/events/${e.id}/rsvp`, { method: "PUT", body: { status } });
        toast.success(status === "yes" ? "Zusage für dein Kind gespeichert." : status === "no" ? "Absage für dein Kind gespeichert." : "Rückmeldung gespeichert.");
        child.reload();
      } catch (err) {
        toast.error(describeError(err));
      }
    });

  const shift = (shiftId: string, on: boolean) =>
    void run(async () => {
      try {
        await api(`/guardian/children/${id}/shifts/${shiftId}`, { method: on ? "PUT" : "DELETE" });
        toast.success(on ? "Dein Kind ist für den Dienst eingetragen." : "Dein Kind ist ausgetragen.");
        child.reload();
      } catch (err) {
        toast.error(describeError(err));
      }
    });

  const leave = (slug: string, name: string) =>
    void run(async () => {
      if (!(await ask(`${c.name} aus „${name}“ austreten lassen? Der Verein löscht dann die Stammdaten deines Kindes.`, { confirmLabel: "Austreten lassen", danger: true }))) return;
      try {
        await api(`/guardian/children/${id}/orgs/${slug}`, { method: "DELETE" });
        toast.success("Die Mitgliedschaft wurde beendet.");
        child.reload();
      } catch (err) {
        toast.error(describeError(err));
      }
    });

  const cancelDeletion = () =>
    void run(async () => {
      try {
        await api(`/guardian/children/${id}/deletion`, { method: "DELETE" });
        toast.success("Die Löschung wurde abgebrochen.");
        child.reload();
      } catch (err) {
        toast.error(describeError(err));
      }
    });

  async function download() {
    try {
      const data = await api<unknown>(`/guardian/children/${id}/export`);
      downloadJson(data, "daten-meines-kindes.json");
      toast.success("Die Daten deines Kindes wurden heruntergeladen.");
    } catch (err) {
      toast.error(describeError(err));
    }
  }

  return (
    <>
      <BackLink href="/kinder">Meine Kinder</BackLink>
      <PageHeader
        title={c.fullName}
        subtitle={
          <>
            {c.age} Jahre · geboren am {dateDe(c.birthDate)} · auf der Plattform „{c.name}“{" "}
            <Badge tone="brand">Jugendkonto</Badge>
          </>
        }
      />
      {c.deletion && (
        <div className="mb-4">
          <Alert tone="info">
            <p>
              {c.deletion.byMe ? "Du hast" : "Dein Elternteil hat"} die Löschung des Jugendkontos beantragt. Es wird am {dateDe(c.deletion.deleteAfter.slice(0, 10))} gelöscht, wenn niemand widerspricht. Bis dahin
              bleibt alles unverändert.
            </p>
            <Button size="sm" variant="secondary" className="relative hit-area mt-2" disabled={busy} onClick={cancelDeletion}>
              {c.deletion.byMe ? "Löschung zurückziehen" : "Widersprechen"}
            </Button>
          </Alert>
        </div>
      )}
      {c.paused && (
        <div className="mb-4">
          <Alert tone="info">
            Dein Kind ist {YOUTH_AGE_LIMIT} geworden. Das Jugendkonto ruht: Du kannst nichts mehr ändern und die Daten nicht mehr herunterladen (sie gehören jetzt deinem Kind), aber die Mitgliedschaft beenden und das Konto löschen. Ein eigenes Konto für dein Kind folgt später („Kommt später“).
          </Alert>
        </div>
      )}

      <SectionTitle>Vereine</SectionTitle>
      <Card flush className="mb-6">
        {c.orgs.length === 0 ? (
          <p className="p-4 text-sm text-muted">Noch in keinem Verein. Melde dein Kind mit einem Einladungslink an oder stelle einen Antrag.</p>
        ) : (
          <ul className="divide-y divide-border">
            {c.orgs.map((o) => (
              <li key={o.orgId} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/vereine/${o.slug}`} className="block truncate font-medium hover:underline">{o.name}</Link>
                  <span className="text-xs text-muted">{o.status === "active" ? "Mitglied" : "Antrag wartet auf die Bestätigung des Vorstands"}</span>
                </div>
                <Button size="sm" variant="secondary" className="relative hit-area" disabled={busy} onClick={() => leave(o.slug, o.name)}>
                  <LogOut size={14} aria-hidden /> {o.status === "active" ? "Austritt" : "Zurückziehen"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {!c.paused && (
          <div className="border-t border-border p-4">
            <Button variant="secondary" className="relative hit-area" onClick={() => setJoinOpen(true)}>Im Verein anmelden</Button>
          </div>
        )}
      </Card>

      <SectionTitle>Termine</SectionTitle>
      {c.events.length === 0 ? (
        <EmptyState emoji="📅" title="Keine anstehenden Termine" className="mb-6">
          Sobald dein Kind Mitglied ist, erscheinen hier die Termine des Vereins.
        </EmptyState>
      ) : (
        <ul className="mb-6 space-y-3">
          {c.events.map((e) => (
            <li key={e.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/kalender/${e.id}`} className="font-semibold hover:underline">{e.title}</Link>
                    <p className="text-sm text-muted">{e.orgName} · {dateTime.format(new Date(e.startsAt))}{e.location ? ` · ${e.location}` : ""}</p>
                  </div>
                  {e.canceled ? <Badge tone="danger">Abgesagt</Badge> : e.myStatus && <Badge tone={e.myStatus === "yes" ? "brand" : "neutral"}>{RSVP_STATUS_LABEL[e.myStatus]}</Badge>}
                </div>
                {!e.canceled && !c.paused && (
                  <div className="mt-3">
                    <SegmentedControl
                      aria-label={`Zu- oder Absage für ${c.name}: ${e.title}`}
                      mode="radio"
                      value={(e.myStatus === "waitlist" ? "yes" : e.myStatus) ?? ("" as RsvpStatus)}
                      onChange={(v) => rsvp(e, v)}
                      options={RSVP_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                      fullWidth
                    />
                  </div>
                )}
                {e.shifts.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Helferdienste</p>
                    <ul className="space-y-2">
                      {e.shifts.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span>
                            {s.title} <span className="text-muted">({s.taken}/{s.slots} Plätze)</span>
                          </span>
                          {!c.paused && !e.canceled && (
                            <Button size="sm" variant={s.mine ? "secondary" : "primary"} className="relative hit-area" disabled={busy || (!s.mine && s.taken >= s.slots)} onClick={() => shift(s.id, !s.mine)}>
                              {s.mine ? "Austragen" : s.taken >= s.slots ? "Voll" : "Eintragen"}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <SectionTitle>Anwesenheit</SectionTitle>
      <Card flush className="mb-6">
        {c.attendance.length === 0 ? (
          <p className="p-4 text-sm text-muted">Noch nichts erfasst. Die Anwesenheit trägt der Verein ein, ohne Angabe eines Grundes.</p>
        ) : (
          <ul className="divide-y divide-border">
            {c.attendance.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 p-4 text-sm">
                <span className="min-w-0 truncate">{a.eventTitle} <span className="text-muted">· {dateTime.format(new Date(a.startsAt))}</span></span>
                <Badge tone={a.status === "present" ? "brand" : "neutral"}>{ATTENDANCE_LABEL[a.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <KindGuardians childId={id} childName={c.name} paused={c.paused} onChanged={() => child.reload()} />

      <SectionTitle>Rechnungen</SectionTitle>
      <Card className="mb-6 text-sm">
        <p>Rechnungen der Vereine für {c.name} gehen an dich{c.isBillingContact ? " (du bist der Rechnungsempfänger)" : ""}. Du findest sie bei <Link href="/rechnungen" className="font-medium underline">Meine Rechnungen</Link>.</p>
      </Card>

      <SectionTitle>Freigaben</SectionTitle>
      <Card flush className="mb-2">
        <ul className="divide-y divide-border">
          {c.consents.map((x, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <span className="min-w-0">
                {CONSENT_LABEL[x.purpose]}
                {x.orgName ? `: ${x.orgName}` : ""}
                <span className="block text-xs text-muted">{dateDe(x.at.slice(0, 10))}</span>
              </span>
              <Badge tone={x.granted ? "brand" : "neutral"}>{x.granted ? "Erteilt" : "Widerrufen"}</Badge>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mb-6 px-1 text-xs text-muted">Du kannst die Mitgliedschaft jederzeit beenden. Weitere Freigaben (Kommentare, Chat, Fotos) und ein eigenes Login für dein Kind: Kommt später.</p>

      <SectionTitle>Daten</SectionTitle>
      <StoredAboutChild />
      <div className="mb-10 flex flex-wrap gap-3">
        {!c.paused && (
          <Button variant="secondary" className="relative hit-area" onClick={() => void download()}>
            <Download size={16} aria-hidden /> Daten ansehen und herunterladen
          </Button>
        )}
        <Button variant="danger" className="relative hit-area" onClick={() => setDeleteOpen(true)}>
          <Trash2 size={16} aria-hidden /> Jugendkonto löschen
        </Button>
      </div>
      <ArrowLink href="/kinder">Zurück zu Meine Kinder</ArrowLink>

      <JoinDialog open={joinOpen} onClose={() => setJoinOpen(false)} childId={id} name={c.name} onDone={() => child.reload()} />
      <DeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        childId={id}
        name={c.fullName}
        twoGuardians={twoGuardians}
        onDone={(res) => {
          if (res.status === "deleted") router.replace("/kinder");
          else {
            setDeleteOpen(false);
            child.reload();
          }
        }}
      />
    </>
  );
}

function JoinDialog({ open, onClose, childId, name, onDone }: { open: boolean; onClose: () => void; childId: string; name: string; onDone: () => void }) {
  const [mode, setMode] = useState<"link" | "slug">("link");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const token = inviteTokenFrom(value);
  const slug = orgSlugFrom(value);
  const valid = mode === "link" ? token !== "" : slug !== "";

  const submit = () =>
    void run(async () => {
      setError(null);
      try {
        const res = await api<{ orgName: string; status: "active" | "pending" }>(`/guardian/children/${childId}/orgs`, {
          method: "POST",
          body: mode === "link" ? { token } : { slug },
        });
        toast.success(res.status === "active" ? `${name} ist jetzt Mitglied bei ${res.orgName}.` : `Antrag bei ${res.orgName} gestellt. Der Vorstand bestätigt ihn.`);
        setValue("");
        onClose();
        onDone();
      } catch (e) {
        setError(describeError(e));
      }
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Im Verein anmelden"
      placement="sheet"
      description={`Du meldest ${name} an. Der Verein sieht dann den vollen Namen, die Zu-/Absagen und die Anwesenheit.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
          <Button onClick={submit} busy={busy} disabled={!valid}>{mode === "link" ? "Mit Einladung anmelden" : "Antrag stellen"}</Button>
        </div>
      }
    >
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        {error && <Alert>{error}</Alert>}
        <SegmentedControl
          aria-label="Art der Anmeldung"
          mode="radio"
          value={mode}
          onChange={(m) => { setMode(m); setValue(""); setError(null); }}
          options={[{ value: "link", label: "Einladungslink" }, { value: "slug", label: "Antrag" }]}
          fullWidth
        />
        {mode === "link" ? (
          <Field id="kind-einladung" label="Einladungslink des Vereins" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" hint="Den Link bekommst du vom Verein. Mit der Einladung ist dein Kind sofort Mitglied." />
        ) : (
          <Field id="kind-verein" label="Adresse des Vereins" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" hint="Zum Beispiel sv-musterstadt (aus der Adresse der Vereinsseite unter /vereine/…). Der Vorstand muss den Antrag bestätigen." />
        )}
      </form>
    </Dialog>
  );
}

function DeleteDialog({ open, onClose, childId, name, twoGuardians, onDone }: { open: boolean; onClose: () => void; childId: string; name: string; twoGuardians: boolean; onDone: (res: DeleteChildResult) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();

  const submit = () =>
    void run(async () => {
      setError(null);
      try {
        const res = await api<DeleteChildResult>(`/guardian/children/${childId}`, { method: "DELETE", body: { password } });
        toast.success(res.status === "deleted" ? "Das Jugendkonto wurde gelöscht." : "Die Löschung ist angekündigt. Der andere Elternteil kann widersprechen.");
        setPassword("");
        onDone(res);
      } catch (e) {
        setError(describeError(e));
      }
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Jugendkonto löschen"
      role="alertdialog"
      description={`Alle Daten von ${name} werden gelöscht: Mitgliedschaften, Zu-/Absagen, Anwesenheit und Stammdaten bei den Vereinen. Das lässt sich nicht rückgängig machen. Rechnungen bleiben als Beleg für den Verein erhalten (gesetzliche Aufbewahrung).${twoGuardians ? ` Weil dein Kind zwei Eltern hat, kündigen wir die Löschung dem anderen Elternteil an. Sie passiert erst nach ${YOUTH_DELETION_NOTICE_DAYS} Tagen, und er oder sie kann widersprechen.` : ""}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
          <Button variant="danger" onClick={submit} busy={busy} disabled={password === ""}>{twoGuardians ? "Löschung ankündigen" : "Endgültig löschen"}</Button>
        </div>
      }
    >
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (password) submit(); }}>
        {error && <Alert>{error}</Alert>}
        <Field id="kind-loeschen-passwort" label="Dein Passwort" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" hint="Zur Bestätigung gibst du dein eigenes Passwort ein." />
      </form>
    </Dialog>
  );
}
