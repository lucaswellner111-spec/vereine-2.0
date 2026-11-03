"use client";

import { MemberRegistry } from "@/components/members-admin";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function MitgliederPage() {
  return <VerwaltungPage id="mitglieder">{(c) => <MemberRegistry slug={c.slug} isAdmin={c.role === "admin"} onError={c.onError} />}</VerwaltungPage>;
}
