"use client";

import { FeeClassesAdmin } from "@/components/members-admin";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function BeitraegePage() {
  return <VerwaltungPage id="beitraege">{(c) => <FeeClassesAdmin slug={c.slug} canEdit={c.role === "admin"} onError={c.onError} />}</VerwaltungPage>;
}
