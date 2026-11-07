import type { OrgRole } from "@vereine/shared";

/** Meldegruende – identisch mit dem Zod-Enum in packages/shared (reportSchema, reportMessageSchema). */
export const REPORT_REASONS = [
  { id: "spam", label: "Spam" },
  { id: "hate", label: "Hass / Hetze" },
  { id: "illegal", label: "Illegal" },
  { id: "other", label: "Sonstiges" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

export function reportReasonLabel(reason: string): string {
  return REPORT_REASONS.find((r) => r.id === reason)?.label ?? reason;
}

export const ROLE_LABEL: Record<OrgRole, string> = {
  admin: "Vorstand",
  treasurer: "Kassenwart",
  moderator: "Moderation",
  member: "Mitglied",
};
