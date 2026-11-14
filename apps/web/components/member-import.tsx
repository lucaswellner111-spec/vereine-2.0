"use client";

import { useState, type ChangeEvent } from "react";
import clsx from "clsx";
import { MEMBER_IMPORT_LIMITS, type MemberImportPreview, type MemberImportResult, type MemberImportRow, type PendingMemberItem, type PendingMemberPage } from "@vereine/shared";
import { api, ApiError, describeError } from "@/lib/api";
import { dateDe } from "@/lib/money";
import { useApi, useBusy, type ApiState } from "@/lib/use-api";
import { Alert, Badge, Button, Card, CellLabel, FileButton, stackTable } from "./ui";
import { ask, toast } from "./ui-hosts";

/** CSV per multipart an die API (kein JSON, damit bis 1 MB ohne Umweg passen). */
async function uploadCsv<T>(slug: string, path: "preview" | "", file: File): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}/member-imports${path ? `/${path}` : ""}`, { method: "POST", body, credentials: "same-origin" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, typeof data?.message === "string" ? data.message : "Die Datei konnte nicht geprüft werden.");
  return data as T;
}

const STATUS: Record<MemberImportRow["status"], { label: string; tone: "brand" | "danger" | "accent" }> = {
  ok: { label: "wird eingeladen", tone: "brand" },
  error: { label: "Fehler", tone: "danger" },
  duplicate: { label: "Dublette", tone: "accent" },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Mitglieder-Import (nur Vorstand): CSV waehlen -> Vorschau vom Server -> bestaetigen. Personen werden eingeladen und
 * treten selbst bei; erst dann entsteht ein Mitgliedsprofil. Darunter die offenen Einladungen aus Importen.
 */
export function MemberImport({ slug, onImported }: { slug: string; onImported?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MemberImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [informed, setInformed] = useState(false);
  const [result, setResult] = useState<MemberImportResult | null>(null);
  const [checking, runCheck] = useBusy();
  const [importing, runImport] = useBusy();
  const pending = useApi<PendingMemberPage>(`/orgs/${slug}/member-imports/pending?limit=100`);

  function reset() {
    setFile(null);
    setPreview(null);
    setError(null);
    setOnlyProblems(false);
    setInformed(false);
  }

  function choose(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = ""; // dieselbe Datei nach Korrektur erneut waehlbar
    if (!f) return;
    setPreview(null);
    setResult(null);
    setError(null);
    if (f.size > MEMBER_IMPORT_LIMITS.maxBytes) return setError("Die Datei ist größer als 1 MB. Bitte teile sie auf.");
    setFile(f);
    void runCheck(async () => {
      try {
        setPreview(await uploadCsv<MemberImportPreview>(slug, "preview", f));
      } catch (err) {
        setError(describeError(err));
      }
    });
  }

  async function confirm() {
    if (!file || !preview) return;
    const later = preview.mail.later ? ` ${preview.mail.later} davon folgen an den nächsten Tagen.` : "";
    if (!(await ask(`${plural(preview.valid, "Person", "Personen")} jetzt per E-Mail einladen?${later}`, { confirmLabel: "Einladungen verschicken", title: "Import bestätigen" }))) return;
    void runImport(async () => {
      setError(null);
      try {
        const res = await uploadCsv<MemberImportResult>(slug, "", file);
        reset();
        setResult(res);
        pending.reload();
        onImported?.();
        toast.success(
          res.mailLater
            ? `${plural(res.imported, "Person", "Personen")} importiert. ${res.mailToday} Einladungen gehen heute raus, ${res.mailLater} folgen automatisch.`
            : `${plural(res.imported, "Person", "Personen")} importiert und eingeladen.`,
        );
      } catch (err) {
        setError(describeError(err));
      }
    });
  }

  const rows = preview ? (onlyProblems ? preview.rows.filter((r) => r.status !== "ok") : preview.rows) : [];

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Mitglieder per CSV importieren</h2>
          <p className="mt-1 text-sm text-muted">
            Kopfzeile mit <strong className="font-medium text-text">Vorname, Nachname, E-Mail</strong> – optional Mitgliedsnummer, Eintrittsdatum (TT.MM.JJJJ) und Beitragsklasse.
            Trennzeichen Semikolon oder Komma, höchstens {MEMBER_IMPORT_LIMITS.maxRows} Zeilen und 1 MB.
          </p>
        </div>
        <Alert tone="info">
          Dein Verein ist verantwortlich und prüft, dass er die Personen einladen darf. Lade nur Personen hoch, die mit einer Einladung rechnen. Übernommen werden nur Name, E-Mail,
          Nummer, Eintritt und Beitragsklasse, andere Spalten werden verworfen. Es entsteht kein Konto: Jede Person bekommt eine persönliche Einladung ({MEMBER_IMPORT_LIMITS.inviteValidDays} Tage
          gültig) und wird erst mit der Annahme Mitglied bei Klubnest. Ohne Annahme löschen wir die Angaben danach.
        </Alert>
        <div className="flex flex-wrap items-center gap-2">
          <FileButton accept=".csv,text/csv,text/plain" onChange={choose} disabled={checking || importing} aria-label="CSV-Datei auswählen" className="max-sm:w-full">
            {checking ? "Wird geprüft …" : file ? "Andere Datei wählen" : "CSV-Datei wählen"}
          </FileButton>
          {file && <span className="min-w-0 truncate text-sm text-muted">{file.name}</span>}
        </div>
        {error && <Alert>{error}</Alert>}
      </Card>

      <div role="status" data-testid="import-result">
        {result && (
          <section aria-labelledby="import-result-title">
            <Card className="space-y-2">
              <h2 id="import-result-title" className="text-base font-semibold">Ergebnis des Imports</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>{plural(result.imported, "Person", "Personen")} {result.mailLater > 0 ? "vorgemerkt" : "vorgemerkt und eingeladen"}.</li>
                <li>{result.mailToday} {result.mailToday === 1 ? "Einladung geht" : "Einladungen gehen"} heute raus.</li>
                {result.mailLater > 0 && <li>{result.mailLater} {result.mailLater === 1 ? "Einladung folgt" : "Einladungen folgen"} automatisch an den nächsten Tagen (Tageslimit für Einladungs-Mails). Nichts geht verloren.</li>}
                {result.skipped > 0 && <li>{plural(result.skipped, "Zeile wurde", "Zeilen wurden")} nicht übernommen (Fehler, Dublette oder bereits eingeladen).</li>}
              </ul>
              <p className="text-xs text-muted">Wer die Einladung annimmt, erscheint in der Mitgliederliste; den Stand siehst du unten bei den offenen Einladungen.</p>
              <Button size="sm" variant="ghost" onClick={() => setResult(null)}>Schließen</Button>
            </Card>
          </section>
        )}
      </div>

      {preview && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            <h2 className="mr-auto text-base font-semibold">Vorschau</h2>
            <Badge tone="brand">{plural(preview.valid, "gültig", "gültig")}</Badge>
            {preview.errors > 0 && <Badge tone="danger">{plural(preview.errors, "Fehler", "Fehler")}</Badge>}
            {preview.duplicates > 0 && <Badge tone="accent">{plural(preview.duplicates, "Dublette", "Dubletten")}</Badge>}
          </div>
          <p className="text-sm text-muted">
            Erkannte Spalten: {preview.columns.map((c) => c.header).join(", ")}
            {preview.ignoredColumns.length > 0 && <> · nicht übernommen: {preview.ignoredColumns.join(", ")}</>}
          </p>
          {preview.valid > 0 && (
            <Alert tone={preview.mail.later ? "info" : "success"}>
              {preview.mail.later
                ? `Heute können noch ${plural(preview.mail.today, "Einladung", "Einladungen")} verschickt werden. Die übrigen ${preview.mail.later} gehen automatisch an den nächsten Tagen raus (Tageslimit für Einladungs-Mails).`
                : `Alle ${plural(preview.valid, "Einladung", "Einladungen")} werden heute verschickt.`}
            </Alert>
          )}
          {preview.errors + preview.duplicates > 0 && (
            <p className="text-sm text-muted">Zeilen mit Fehlern oder Dubletten werden übersprungen. Korrigiere sie in der Datei und lade sie erneut hoch – bereits Eingeladene erkennt der Import.</p>
          )}
          {preview.errors + preview.duplicates > 0 && preview.valid > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setOnlyProblems(!onlyProblems)} aria-pressed={onlyProblems}>
              {onlyProblems ? "Alle Zeilen zeigen" : "Nur Probleme zeigen"}
            </Button>
          )}
          <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-border/70 sm:overflow-x-auto">
            <table className={stackTable.table}>
              <caption className="sr-only">Vorschau des Imports</caption>
              <thead className={stackTable.thead}>
                <tr>
                  <th className="p-3 font-medium">Zeile</th>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">E-Mail</th>
                  <th className="p-3 font-medium">Nr.</th>
                  <th className="p-3 font-medium">Eintritt</th>
                  <th className="p-3 font-medium">Beitragsklasse</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className={stackTable.tbody}>
                {rows.map((r) => (
                  <tr key={r.line} className={clsx(stackTable.tr, r.status !== "ok" && "bg-surface-2/60")}>
                    <td className={clsx(stackTable.td, "text-muted")}><CellLabel>Zeile</CellLabel><span className="tabular-nums">{r.line}</span></td>
                    <td className={stackTable.tdMain}>{[r.firstName, r.lastName].filter(Boolean).join(" ") || "–"}</td>
                    <td className={clsx(stackTable.td, "break-all")}><CellLabel>E-Mail</CellLabel>{r.email || "–"}</td>
                    <td className={clsx(stackTable.td, "text-muted")}><CellLabel>Nr.</CellLabel><span className="tabular-nums">{r.memberNo ?? "–"}</span></td>
                    <td className={clsx(stackTable.td, "text-muted")}><CellLabel>Eintritt</CellLabel>{dateDe(r.joinedOn)}</td>
                    <td className={clsx(stackTable.td, "text-muted")}><CellLabel>Beitragsklasse</CellLabel>{r.feeClassName ?? "–"}</td>
                    <td className={stackTable.td}>
                      <CellLabel>Status</CellLabel>
                      <div className="space-y-1 sm:max-w-64">
                        <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                        {r.problems.map((p) => <p key={p} className="text-xs text-muted">{p}</p>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.valid > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={informed} onChange={(e) => setInformed(e.target.checked)} className="mt-1 size-4" />
              <span>Ich habe die Personen informiert bzw. weiß, dass sie mit einer Einladung rechnen.</span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirm} busy={importing} disabled={preview.valid === 0 || !informed} className="max-sm:w-full">
              {preview.valid ? `${plural(preview.valid, "Person", "Personen")} einladen` : "Nichts zu importieren"}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={importing} className="max-sm:w-full">Abbrechen</Button>
          </div>
        </Card>
      )}

      <PendingList slug={slug} state={pending} />
    </div>
  );
}

function PendingList({ slug, state }: { slug: string; state: ApiState<PendingMemberPage> }) {
  const page = state.data;
  if (!page || page.total === 0) return null;
  const label = (p: PendingMemberItem) =>
    p.status === "queued" ? <Badge>wartet auf Versand</Badge> : p.status === "expired" ? <Badge tone="danger">abgelaufen</Badge> : <Badge tone="brand">eingeladen</Badge>;

  async function remove(p: PendingMemberItem) {
    if (!(await ask(`Einladung für ${p.firstName} ${p.lastName} zurückziehen und die Angaben löschen?`, { confirmLabel: "Zurückziehen", danger: true }))) return;
    try {
      await api(`/orgs/${slug}/member-imports/pending/${p.id}`, { method: "DELETE" });
      state.reload();
      toast.success("Einladung zurückgezogen.");
    } catch (err) {
      toast.error(describeError(err));
    }
  }

  return (
    <Card flush>
      <div className="p-4 pb-2">
        <h2 className="text-base font-semibold">Eingeladen, noch nicht beigetreten ({page.total})</h2>
        <p className="mt-1 text-xs text-muted">Wer die Einladung annimmt, erscheint mit Nummer, Eintritt und Beitragsklasse in der Mitgliederliste.</p>
      </div>
      <ul className="divide-y divide-border">
        {page.items.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{p.firstName} {p.lastName}{p.memberNo !== null && <span className="font-normal text-muted"> · Nr. {p.memberNo}</span>}</p>
              <p className="break-all text-xs text-muted">{p.email}{p.sentAt && ` · verschickt am ${dateDe(p.sentAt.slice(0, 10))}`}</p>
            </div>
            {label(p)}
            <Button size="sm" variant="ghost" onClick={() => remove(p)} aria-label={`Einladung für ${p.firstName} ${p.lastName} zurückziehen`}>Zurückziehen</Button>
          </li>
        ))}
      </ul>
      {page.total > page.items.length && <p className="px-4 pb-3 text-xs text-muted">Es werden die neuesten {page.items.length} angezeigt.</p>}
    </Card>
  );
}
