"use client";

import { use } from "react";
import { KindDetail } from "@/components/kind-detail";

export default function KindPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <KindDetail id={id} />;
}
