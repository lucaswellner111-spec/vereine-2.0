"use client";

import { MembersManager } from "@/components/members-roles";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function RollenPage() {
  return <VerwaltungPage id="rollen">{(c) => <MembersManager slug={c.slug} mode="active" onError={c.onError} onChanged={c.refresh} />}</VerwaltungPage>;
}
