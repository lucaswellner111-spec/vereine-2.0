"use client";

import clsx from "clsx";
import { useState } from "react";
import { Alert, Button, Card, Checkbox, ConceptNote, PageHeader } from "@/components/ui";
import { eur, orgs } from "@/lib/mock";

const amounts = [5, 10, 25, 50, 100];

export default function DonatePage() {
  const campaigns = orgs.filter((o) => o.donationGoal);
  const [orgSlug, setOrgSlug] = useState(campaigns[0].slug);
  const [amount, setAmount] = useState(25);
  const [monthly, setMonthly] = useState(false);
  const [receipt, setReceipt] = useState(true);
  const [done, setDone] = useState(false);

  const org = campaigns.find((c) => c.slug === orgSlug)!;

  return (
    <>
      <PageHeader title="Spenden" subtitle="Deine Spende geht direkt an den Verein." />
      <ConceptNote>
        Zahlung läuft später über Mollie/Stripe Connect (Auszahlung direkt an den Verein). Es wird hier nichts abgebucht.
      </ConceptNote>

      <div className="grid gap-4 md:grid-cols-2">
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <li key={c.slug}>
              <button onClick={() => { setOrgSlug(c.slug); setDone(false); }} className="block w-full text-left" aria-pressed={c.slug === orgSlug}>
                <Card className={clsx(c.slug === orgSlug && "border-brand ring-2 ring-[var(--ring)]")}>
                  <p className="text-sm font-medium">{c.donationGoal!.title}</p>
                  <p className="text-xs text-muted">{c.name}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full bg-accent" style={{ width: `${(c.donationGoal!.raised / c.donationGoal!.goal) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted">{eur(c.donationGoal!.raised)} von {eur(c.donationGoal!.goal)}</p>
                </Card>
              </button>
            </li>
          ))}
        </ul>

        <Card>
          <h2 className="font-semibold">{org.donationGoal!.title}</h2>
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-medium">Betrag</legend>
            <div className="flex flex-wrap gap-2">
              {amounts.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAmount(a)}
                  aria-pressed={amount === a}
                  className={clsx("h-10 rounded-lg border px-4 text-sm font-medium", amount === a ? "border-brand bg-brand/15 text-brand" : "border-border hover:bg-surface-2")}
                >
                  {eur(a)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="mt-4 space-y-2.5">
            <Checkbox id="monthly" checked={monthly} onChange={(e) => setMonthly(e.target.checked)}>Monatlich wiederholen</Checkbox>
            <Checkbox id="receipt" checked={receipt} onChange={(e) => setReceipt(e.target.checked)}>Zuwendungsbestätigung (Spendenquittung) erhalten</Checkbox>
          </div>
          {done ? (
            <div className="mt-5"><Alert tone="success">Danke! (Konzept – keine echte Zahlung ausgelöst.)</Alert></div>
          ) : (
            <Button className="mt-5 w-full" onClick={() => setDone(true)}>
              {eur(amount)}{monthly ? " monatlich" : ""} spenden
            </Button>
          )}
        </Card>
      </div>
    </>
  );
}
