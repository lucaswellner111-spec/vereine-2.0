"use client";

import { InvitesAdmin } from "@/components/org-onboarding-admin";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function EinladungenPage() {
  return <VerwaltungPage id="einladungen">{(c) => <InvitesAdmin slug={c.slug} onError={c.onError} />}</VerwaltungPage>;
}
