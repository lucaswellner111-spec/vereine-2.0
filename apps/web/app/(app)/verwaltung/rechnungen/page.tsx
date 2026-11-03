"use client";

import { InvoicesAdmin } from "@/components/invoices-admin";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function RechnungenPage() {
  return <VerwaltungPage id="rechnungen">{(c) => <InvoicesAdmin slug={c.slug} onError={c.onError} />}</VerwaltungPage>;
}
