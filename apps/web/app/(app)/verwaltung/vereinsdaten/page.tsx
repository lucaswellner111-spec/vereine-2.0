"use client";

import { BillingProfileAdmin } from "@/components/org-onboarding-admin";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function VereinsdatenPage() {
  return <VerwaltungPage id="vereinsdaten">{(c) => <BillingProfileAdmin slug={c.slug} canEdit={c.role === "admin"} onError={c.onError} />}</VerwaltungPage>;
}
