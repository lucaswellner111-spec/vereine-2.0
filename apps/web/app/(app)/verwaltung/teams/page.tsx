"use client";

import { TeamsAdmin } from "@/components/teams-admin";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function TeamsPage() {
  return <VerwaltungPage id="teams">{(c) => <TeamsAdmin slug={c.slug} onError={c.onError} />}</VerwaltungPage>;
}
