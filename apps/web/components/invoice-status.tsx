import type { InvoiceSummary } from "@vereine/shared";
import { Badge } from "./ui";

const label: Record<InvoiceSummary["displayStatus"], string> = {
  draft: "Entwurf",
  open: "Offen",
  paid: "Bezahlt",
  void: "Storniert",
  overdue: "Überfällig",
};
const tone = { draft: "neutral", open: "accent", paid: "brand", void: "neutral", overdue: "danger" } as const;

export function InvoiceStatusBadge({ status }: { status: InvoiceSummary["displayStatus"] }) {
  return <Badge tone={tone[status]}>{label[status]}</Badge>;
}
