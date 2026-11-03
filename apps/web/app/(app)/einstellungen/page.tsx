"use client";

import { ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, Button, Card, PageHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { SETTINGS_ITEMS } from "@/lib/settings-nav";

/** Ordnerliste der Einstellungen (Handy). Am Desktop steht das Untermenue in der Seitenleiste: direkt zum Profil. */
export default function SettingsIndexPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) router.replace("/einstellungen/profil");
  }, [router]);

  return (
    <>
      <PageHeader title="Einstellungen" subtitle={user?.email} />
      {user && (
        <Card className="mb-4 flex items-center gap-3">
          <Avatar name={user.displayName} size={44} />
          <div className="min-w-0">
            <p className="truncate font-medium">{user.displayName}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </Card>
      )}
      <Card className="divide-y divide-border p-0">
        {SETTINGS_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex min-h-12 items-center gap-3 px-4 text-sm font-medium hover:bg-surface-2">
            <Icon size={18} aria-hidden className="text-muted" />
            <span className="flex-1">{label}</span>
            <ChevronRight size={16} aria-hidden className="text-muted" />
          </Link>
        ))}
      </Card>
      <h2 className="mb-2 mt-6 text-sm font-semibold">Darstellung</h2>
      <Card className="space-y-3">
        <p className="text-sm text-muted">Automatisch folgt der Einstellung deines Geräts.</p>
        <ThemeToggle fullWidth />
      </Card>
      <Button variant="secondary" className="mt-6 w-full" onClick={() => logout().then(() => router.replace("/login"))}>
        <LogOut size={16} aria-hidden /> Abmelden
      </Button>
    </>
  );
}
