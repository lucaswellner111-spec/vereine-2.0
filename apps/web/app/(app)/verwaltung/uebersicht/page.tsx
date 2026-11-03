"use client";

import { DashboardPanel } from "@/components/members-admin";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function UebersichtPage() {
  return <VerwaltungPage id="uebersicht">{(c) => <DashboardPanel slug={c.slug} onError={c.onError} />}</VerwaltungPage>;
}
