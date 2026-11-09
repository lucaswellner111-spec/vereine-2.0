"use client";

import { MailWarning } from "lucide-react";
import type { PublicUser } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useBusy } from "@/lib/use-api";
import { toast } from "./ui-hosts";
import { Button } from "./ui";

/** Hinweis, solange die E-Mail-Adresse unbestaetigt ist (Verein gruenden und Einladungen sind bis dahin gesperrt). */
export function EmailVerifyBanner({ user }: { user: PublicUser }) {
  const [busy, run] = useBusy();
  if (user.emailVerified !== false) return null;

  const resend = () =>
    run(async () => {
      try {
        await api("/auth/email/resend", { method: "POST", body: {} });
        toast.success(`Wir haben dir einen neuen Link an ${user.email} geschickt.`);
      } catch (e) {
        toast.error(describeError(e));
      }
    });

  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
      <MailWarning size={18} aria-hidden className="shrink-0 text-accent" />
      <p className="min-w-0 flex-1">
        Bitte bestätige deine E-Mail-Adresse. Bis dahin kannst du keinen Verein gründen und keine Einladungen verschicken.
      </p>
      <Button variant="secondary" size="sm" busy={busy} onClick={resend}>Link erneut senden</Button>
    </div>
  );
}
