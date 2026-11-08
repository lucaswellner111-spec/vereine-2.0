"use client";

import { BillingProfileAdmin } from "@/components/org-onboarding-admin";
import { OrgProfileForm } from "@/components/org-profile-form";
import { PublicPageAdmin } from "@/components/public-page-admin";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function VereinsdatenPage() {
  return (
    <VerwaltungPage id="vereinsdaten">
      {(c) => (
        <>
          {/* Vereinsprofil nur fuer den Vorstand; Rechnungsdaten sieht auch der Kassenwart */}
          {c.role === "admin" && <OrgProfileForm key={c.slug} slug={c.slug} canEdit />}
          {c.role === "admin" && <PublicPageAdmin key={"pub-" + c.slug} slug={c.slug} />}
          <BillingProfileAdmin slug={c.slug} canEdit={c.role === "admin"} onError={c.onError} />
        </>
      )}
    </VerwaltungPage>
  );
}
