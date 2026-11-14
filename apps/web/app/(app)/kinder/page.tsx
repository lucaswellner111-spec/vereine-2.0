"use client";

import { KinderAdmin } from "@/components/kinder-admin";
import { SettingsBackLink } from "@/components/settings-back-link";

export default function KinderPage() {
  return (
    <>
      <SettingsBackLink />
      <KinderAdmin />
    </>
  );
}
