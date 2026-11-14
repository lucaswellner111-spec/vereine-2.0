"use client";

import { Check, Circle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AvvStatus, EventItem, FeeClassItem, InviteItem, OrgBillingProfile, OrgDetail } from "@vereine/shared";
import { api } from "@/lib/api";
import { Card } from "./ui";

type Step = { id: string; label: string; hint: string; href: string; done: boolean };

/**
 * "Erste Schritte" fuer neue Vereine (nur Vorstand): zeigt, was schon erledigt ist, und fuehrt zum naechsten Schritt.
 * Verschwindet, wenn alles erledigt ist oder der Vorstand es ausblendet (nur lokal im Browser gemerkt).
 */
export function OnboardingChecklist({ slug }: { slug: string }) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const key = `onboarding-hidden:${slug}`;

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(key) === "1");
    } catch {
      /* localStorage nicht verfuegbar */
    }
  }, [key]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api<OrgDetail>(`/orgs/${slug}`),
      api<OrgBillingProfile>(`/orgs/${slug}/billing-profile`).catch(() => null),
      api<InviteItem[]>(`/orgs/${slug}/invites`).catch(() => []),
      api<EventItem[]>(`/orgs/${slug}/events`).catch(() => []),
      api<FeeClassItem[]>(`/orgs/${slug}/fee-classes`).catch(() => []),
      api<{ posts: unknown[] }>(`/orgs/${slug}/posts`).catch(() => ({ posts: [] })),
      api<AvvStatus>(`/orgs/${slug}/avv`).catch(() => null),
    ]).then(([org, profile, invites, events, classes, posts, avv]) => {
      if (!alive) return;
      setSteps([
        { id: "tags", label: "Sportarten und Themen festlegen", hint: "Damit Interessierte deinen Verein finden.", href: `/vereine/${slug}`, done: org.tags.length > 0 },
        { id: "invite", label: "Mitglieder einladen", hint: "Ein Link reicht, niemand muss Listen abtippen.", href: "/verwaltung/einladungen", done: invites.length > 0 || org.members > 1 },
        { id: "event", label: "Ersten Termin anlegen", hint: "Training, Spiel oder Treffen mit Zu- und Absage.", href: "/verwaltung/termine", done: events.length > 0 },
        { id: "post", label: "Ersten Beitrag veröffentlichen", hint: "Zeig, dass dein Verein lebt.", href: "/feed", done: posts.posts.length > 0 },
        { id: "data", label: "Vereinsdaten eintragen", hint: "Anschrift und IBAN erscheinen auf Rechnungen.", href: "/verwaltung/vereinsdaten", done: !!profile && (profile.address.length > 0 || profile.iban.length > 0) },
        { id: "fees", label: "Beitragsklassen anlegen", hint: "Grundlage für Beiträge und Rechnungen.", href: "/verwaltung/beitraege", done: classes.length > 0 },
        // Ohne Status (Fehler) keinen Punkt zeigen; sonst erledigt, sobald die aktuelle Fassung akzeptiert ist
        ...(avv ? [{ id: "avv", label: "Vertrag zur Auftragsverarbeitung akzeptieren", hint: "Nötig, damit wir Mitgliederdaten und Rechnungen in deinem Auftrag verarbeiten dürfen.", href: "/verwaltung/vertrag", done: avv.upToDate }] : []),
      ]);
    })
      // Ohne Vereinsdaten keine Checkliste (sie ist nur eine Hilfe, kein Pflichtbereich)
      .catch(() => alive && setSteps(null));
    return () => {
      alive = false;
    };
  }, [slug]);

  if (!steps || hidden) return null;
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const next = steps.find((s) => !s.done)!;

  return (
    <Card className="mb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Erste Schritte</h2>
          <p className="mt-0.5 text-sm text-muted">{doneCount} von {steps.length} erledigt. Als Nächstes: <Link href={next.href} className="font-medium text-brand hover:underline">{next.label}</Link></p>
        </div>
        <button
          type="button"
          aria-label="Erste Schritte ausblenden"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(key, "1");
            } catch {
              /* nur fuer diese Sitzung */
            }
          }}
          className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} aria-label="Fortschritt">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.id}>
            <Link href={s.href} className="flex items-start gap-2.5 rounded-md py-1 text-sm hover:text-brand">
              {s.done ? <Check size={16} aria-hidden className="mt-0.5 shrink-0 text-brand" /> : <Circle size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />}
              <span>
                <span className={s.done ? "text-muted line-through" : "font-medium"}>{s.label}</span>
                {!s.done && <span className="block text-xs text-muted">{s.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
