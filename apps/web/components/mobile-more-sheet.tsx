"use client";

import clsx from "clsx";
import { Flag, LayoutDashboard, LogOut, Receipt, Settings, UserSearch, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { PublicUser } from "@vereine/shared";
import { ThemeToggle } from "./theme-toggle";
import { Avatar, Button } from "./ui";
import { Dialog } from "./ui-client";

type SheetLink = { href: string; label: string; icon: LucideIcon };

/**
 * "Mehr" am Handy: alles, was nicht in die Bottom-Nav passt (Personen, Verwaltung, Einstellungen,
 * Rechnungen, Plattform), dazu Darstellung und Abmelden. Schliesst bei Link-Klick und Seitenwechsel.
 */
export function MobileMoreSheet({
  open,
  onClose,
  user,
  profileHref = "/einstellungen/profil",
  avatarId = null,
  showVerwaltung,
  showPlattform,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  user: PublicUser;
  /** Eigenes Profil (/profil/{handle}); ohne Handle die Profil-Einstellungen. */
  profileHref?: string;
  avatarId?: string | null;
  showVerwaltung: boolean;
  showPlattform: boolean;
  onLogout: () => void;
}) {
  const pathname = usePathname() ?? "";
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    onCloseRef.current();
  }, [pathname]);

  const links: SheetLink[] = [
    { href: "/personen", label: "Personen finden", icon: UserSearch },
    ...(showVerwaltung ? [{ href: "/verwaltung", label: "Verwaltung", icon: LayoutDashboard }] : []),
    { href: "/einstellungen", label: "Einstellungen", icon: Settings },
    { href: "/rechnungen", label: "Rechnungen", icon: Receipt },
    ...(showPlattform ? [{ href: "/plattform", label: "Plattform", icon: Flag }] : []),
  ];
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <Dialog open={open} onClose={onClose} title="Mehr" placement="sheet" size="sm" className="pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      <Link
        href={profileHref}
        onClick={onClose}
        aria-current={isCurrent(profileHref) ? "page" : undefined}
        className="flex items-center gap-3 rounded-lg bg-surface-2 p-3 hover:bg-border/40"
      >
        <span className="sr-only">Mein Profil: </span>
        <Avatar name={user.displayName} mediaId={avatarId} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{user.displayName}</span>
          <span className="block truncate text-xs text-muted">{user.email}</span>
        </span>
      </Link>
      <nav aria-label="Weitere Bereiche" className="mt-3">
        <ul className="space-y-0.5">
          {links.map(({ href, label, icon: Icon }) => {
            const current = isCurrent(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onClose}
                  aria-current={current ? "page" : undefined}
                  className={clsx(
                    "flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                    current ? "bg-brand/15 text-brand" : "text-text hover:bg-surface-2",
                  )}
                >
                  <Icon size={18} aria-hidden className={current ? undefined : "text-muted"} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <ThemeToggle fullWidth />
        <Button variant="ghost" className="w-full" onClick={onLogout}>
          <LogOut size={16} aria-hidden /> Abmelden
        </Button>
      </div>
    </Dialog>
  );
}
