"use client";

import { ModerationQueue } from "@/components/moderation-queue";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function ModerationPage() {
  return <VerwaltungPage id="moderation">{(c) => <ModerationQueue slug={c.slug} onError={c.onError} />}</VerwaltungPage>;
}
