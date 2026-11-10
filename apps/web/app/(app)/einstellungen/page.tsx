"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, Card, ListGroup, ListRow, ListSkeleton } from "@/components/ui";
import { LargeTitleHeader } from "@/components/ui-client";
import { useAuth } from "@/lib/auth";
import { SETTINGS_ITEMS } from "@/lib/settings-nav";
import { useIsDesktopState } from "@/lib/use-media-query";

/** Ordnerliste der Einstellungen (Handy). Am Desktop steht das Untermenue in der Seitenleiste: direkt zum Profil. */
export default function SettingsIndexPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const isDesktop = useIsDesktopState();

  useEffect(() => {
    if (isDesktop) router.replace("/einstellungen/profil");
  }, [isDesktop, router]);

  // Bis klar ist, ob weitergeleitet wird, nichts Falsches aufblitzen lassen
  if (isDesktop !== false) return <ListSkeleton rows={4} />;

  return (
    <>
      <LargeTitleHeader title="Einstellungen" subtitle={user?.email} />
      {user && (
        <Card className="mb-6 flex items-center gap-3">
          <Avatar name={user.displayName} size={52} />
          <div className="min-w-0">
            <p className="truncate text-[1.0625rem] font-semibold">{user.displayName}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </Card>
      )}
      <ListGroup>
        {SETTINGS_ITEMS.map(({ href, label, icon }) => (
          <ListRow key={href} href={href} icon={icon} title={label} tone={href === "/rechnungen" ? "accent" : "brand"} />
        ))}
      </ListGroup>
      <h2 className="mb-1.5 mt-6 px-4 text-[0.8125rem] font-semibold uppercase tracking-wide text-muted">Darstellung</h2>
      <Card className="space-y-3">
        <p className="text-sm text-muted">Automatisch folgt der Einstellung deines Geräts.</p>
        <ThemeToggle fullWidth />
      </Card>
      <ListGroup className="mt-6">
        <ListRow icon={LogOut} tone="danger" title="Abmelden" danger onClick={() => void logout().then(() => router.replace("/login"))} />
      </ListGroup>
    </>
  );
}
