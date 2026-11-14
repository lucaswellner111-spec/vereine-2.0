"use client";

import { AvvAdmin } from "@/components/avv-admin";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function VertragPage() {
  return <VerwaltungPage id="vertrag">{(c) => <AvvAdmin key={c.slug} slug={c.slug} />}</VerwaltungPage>;
}
