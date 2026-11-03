"use client";

import { ModerationTool } from "@/components/moderation-tool";
import { VerwaltungPage } from "@/components/verwaltung-page";

export default function ModerationPage() {
  return <VerwaltungPage id="moderation">{(c) => <ModerationTool slug={c.slug} onError={c.onError} />}</VerwaltungPage>;
}
