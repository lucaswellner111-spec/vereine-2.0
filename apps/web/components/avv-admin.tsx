"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AVV_DOCUMENT, AVV_DRAFT_NOTICE, type AvvStatus } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useApi, useBusy } from "@/lib/use-api";
import { Alert, Badge, Button, Card, Checkbox, CardSkeletons, ErrorState } from "./ui";
import { toast } from "./ui-hosts";

const dateTimeDe = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) + " Uhr";
const dayDe = (iso: string) => iso.split("-").reverse().join(".");

/**
 * Hinweis ueber Verwaltungsseiten, solange die Zustimmung zum AVV fehlt und der Server Schreibaktionen sperrt
 * (AVV_REQUIRED). Verschwindet nach der Zustimmung; bei Fehlern still (ist nur ein Hinweis).
 */
export function AvvBanner({ slug }: { slug: string }) {
  const status = useApi<AvvStatus>(`/orgs/${slug}/avv`);
  const s = status.data;
  if (!s || s.upToDate || !s.required) return null;
  return (
    <div className="mb-4">
      <Alert tone={s.blocked ? "danger" : "info"}>
        {s.blocked ? "Mitgliederdaten, Beiträge, Rechnungen und Einladungen per Mail sind gesperrt, bis dein Verein den Vertrag zur Auftragsverarbeitung akzeptiert hat. " : `Es gibt eine neue Fassung des Vertrags zur Auftragsverarbeitung. Bitte stimme bis zum ${s.graceUntil ? dayDe(s.graceUntil) : "Ende der Frist"} zu. `}
        <Link href="/verwaltung/vertrag" className="font-medium underline">
          {s.canAccept ? "Jetzt ansehen und zustimmen" : "Zum Vertrag (der Vorstand muss zustimmen)"}
        </Link>
      </Alert>
    </div>
  );
}

/** Seite "Vertrag zur Auftragsverarbeitung": Text lesen, als Vorstand zustimmen, Nachweis mit Datum und Person, Download. */
export function AvvAdmin({ slug }: { slug: string }) {
  const status = useApi<AvvStatus>(`/orgs/${slug}/avv`);
  const [checked, setChecked] = useState(false);
  const [busy, run] = useBusy();
  const s = status.data;

  if (status.error && !s) return <ErrorState message={status.error} onRetry={status.reload} />;
  if (!s) return <CardSkeletons count={2} />;

  const draft = s.current.status === "draft";
  // Falls Browser und Server verschiedene Fassungen kennen (Deploy laeuft): nicht blind zustimmen
  const outdated = s.current.version !== AVV_DOCUMENT.version;

  async function accept() {
    if (!s) return;
    await run(async () => {
      try {
        const next = await api<AvvStatus>(`/orgs/${slug}/avv/accept`, { method: "POST", body: { version: s.current.version, textHash: s.current.textHash, confirm: true } });
        status.setData(next);
        setChecked(false);
        toast.success("Danke, die Zustimmung ist gespeichert.");
      } catch (e) {
        toast.error(describeError(e));
      }
    });
  }

  return (
    <div className="space-y-4">
      {draft && <Alert tone="info"><strong>{AVV_DRAFT_NOTICE}</strong> Bis der geprüfte Text vorliegt, gilt deine Zustimmung nur für diese Fassung; bei einer neuen Fassung wirst du erneut gefragt.</Alert>}

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Stand deines Vereins</h2>
          {s.upToDate ? <Badge tone="brand">Zugestimmt</Badge> : <Badge tone={s.blocked ? "danger" : "accent"}>{s.accepted ? "Neue Fassung offen" : "Noch nicht zugestimmt"}</Badge>}
        </div>
        {s.accepted ? (
          <p className="mt-2 text-sm text-muted" data-testid="avv-proof">
            Fassung <span className="font-mono">{s.accepted.version}</span>, zugestimmt am {dateTimeDe(s.accepted.acceptedAt)} von {s.accepted.acceptedBy ?? "einem inzwischen gelöschten Konto"}.
            {!s.upToDate && s.graceUntil && <> Du kannst bis zum {dayDe(s.graceUntil)} weiterarbeiten wie bisher.</>}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">Ohne diesen Vertrag darf die Plattform Mitgliederdaten, Beiträge und Rechnungen nicht in deinem Auftrag verarbeiten.{s.required ? " Diese Funktionen sind deshalb gesperrt." : ""}</p>
        )}
        <p className="mt-2 break-all text-xs text-muted">Prüfsumme (SHA-256) der aktuellen Fassung: <span className="font-mono">{s.current.textHash}</span></p>
        <a
          href={`/api/orgs/${encodeURIComponent(slug)}/avv/document`}
          download
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-brand hover:underline"
        >
          <Download size={16} aria-hidden /> {s.accepted ? "Zugestimmten Text herunterladen" : "Text herunterladen"}
        </a>
      </Card>

      <Card>
        <h2 className="font-semibold">{AVV_DOCUMENT.title}</h2>
        <p className="mt-0.5 text-xs text-muted">Fassung {AVV_DOCUMENT.version} · Stand {dayDe(AVV_DOCUMENT.publishedAt)}</p>
        {/* Scrollbarer Bereich ist per Tastatur erreichbar (tabIndex) und benannt */}
        <div tabIndex={0} role="region" aria-label="Text des Vertrags zur Auftragsverarbeitung" className="mt-3 max-h-[28rem] space-y-4 overflow-y-auto rounded-lg border border-border/70 p-3 text-sm focus-visible:outline-2">
          {AVV_DOCUMENT.sections.map((sec) => (
            <section key={sec.heading}>
              <h3 className="font-medium">{sec.heading}</h3>
              {sec.paragraphs.map((p, i) => (
                <p key={i} className="mt-1.5 text-muted">{p}</p>
              ))}
            </section>
          ))}
        </div>
      </Card>

      {!s.upToDate && (
        <Card>
          {outdated ? (
            <Alert>Der Vertragstext hat sich geändert. Bitte lade die Seite neu, bevor du zustimmst.</Alert>
          ) : s.canAccept ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void accept();
              }}
              className="space-y-3"
            >
              <Checkbox id="avv-confirm" checked={checked} onChange={(e) => setChecked(e.target.checked)}>
                Ich habe den Vertrag gelesen und stimme ihm im Namen unseres Vereins zu. Ich bin vertretungsberechtigt (Vorstand).
              </Checkbox>
              <Button type="submit" disabled={!checked} busy={busy}>Zustimmen</Button>
              <p className="text-xs text-muted">Wir speichern Fassung, Prüfsumme, Zeitpunkt und dein Konto als Nachweis, keine IP-Adresse.</p>
            </form>
          ) : (
            <p className="text-sm text-muted">Nur der Vorstand kann dem Vertrag zustimmen.</p>
          )}
        </Card>
      )}
    </div>
  );
}
