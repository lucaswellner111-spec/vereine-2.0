"use client";

import { EventsAdmin } from "@/components/events-admin";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function TerminePage() {
  return <VerwaltungPage id="termine">{(c) => <EventsAdmin slug={c.slug} onError={c.onError} />}</VerwaltungPage>;
}
