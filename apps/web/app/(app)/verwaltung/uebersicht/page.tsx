"use client";

import { DashboardPanel } from "@/components/members-admin";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function UebersichtPage() {
  return (
    <VerwaltungPage id="uebersicht">
      {(c) => (
        <>
          {c.role === "admin" && <OnboardingChecklist slug={c.slug} />}
          <DashboardPanel slug={c.slug} onError={c.onError} />
        </>
      )}
    </VerwaltungPage>
  );
}
