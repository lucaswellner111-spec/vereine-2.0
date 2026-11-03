"use client";

import clsx from "clsx";
import { Building2, CalendarDays, ChevronDown, Flag, Heart, LayoutDashboard, LogOut, MessageSquare, Newspaper, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { PublicUser } from "@vereine/shared";
import { useAuth } from "@/lib/auth";
import { ChatProvider, useChat } from "@/lib/chat";
import { SETTINGS_ITEMS } from "@/lib/settings-nav";
import { itemsForRole, useVerwaltung, VerwaltungProvider } from "@/lib/verwaltung";
import { NotificationBell } from "./notification-bell";
import { ThemeCycleButton, ThemeToggle } from "./theme-toggle";
import { Logo } from "./site";
import { Avatar, Button } from "./ui";

type NavItem = { href: string; label: string; icon: LucideIcon };

const nav: NavItem[] = [
  { href: "/feed", label: "Feed", icon: Newspaper },
  { href: "/vereine", label: "Vereine", icon: Building2 },
  { href: "/kalender", label: "Kalender", icon: CalendarDays },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/spenden", label: "Spenden", icon: Heart },
  { href: "/verwaltung", label: "Verwaltung", icon: LayoutDashboard },
];

const platformItem: NavItem = { href: "/plattform", label: "Plattform", icon: Flag };

const linkClass = (active: boolean) =>
  clsx(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    active ? "bg-brand/15 text-brand" : "text-muted hover:bg-surface-2 hover:text-text",
  );

function UnreadBadge({ n, floating }: { n: number; floating?: boolean }) {
  return (
    <span
      aria-label={`${n} ungelesene Nachrichten`}
      className={clsx(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-on-danger",
        floating ? "absolute -right-2.5 -top-1.5" : "ml-auto",
      )}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted" role="status">
        Lade …
      </div>
    );
  }

  // Die Chat-Verbindung und die Verwaltungs-Auswahl werden erst fuer angemeldete Nutzer aufgebaut.
  return (
    <ChatProvider>
      <VerwaltungProvider>
        <Shell user={user}>{children}</Shell>
      </VerwaltungProvider>
    </ChatProvider>
  );
}

/** Menuepunkt "Verwaltung" mit aufklappbarem Register der Unterpunkte (nur Bereiche, die die Rolle nutzen darf). */
function VerwaltungGroup({ item, active, pathname }: { item: NavItem; active: boolean; pathname: string }) {
  const { orgs, slug, setSlug, role } = useVerwaltung();
  const children = itemsForRole(role);
  const [open, setOpen] = useState(false);
  // Unter /verwaltung ist das Register immer offen; sonst klappt es per Klick auf.
  const expanded = active || open;
  const Icon = item.icon;

  return (
    <div>
      <div className={clsx("flex items-center rounded-lg", active && "bg-brand/15")}>
        <Link href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={clsx(linkClass(false), "flex-1", active && "text-brand hover:bg-transparent")}>
          <Icon size={18} aria-hidden />
          {item.label}
        </Link>
        {children.length > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="verwaltung-register"
            aria-label={expanded ? "Verwaltung einklappen" : "Verwaltung aufklappen"}
            onClick={() => setOpen((o) => !o)}
            className={clsx("mr-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-text", active && "text-brand")}
          >
            <ChevronDown size={16} aria-hidden className={clsx("transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
      {expanded && children.length > 0 && (
        <div id="verwaltung-register" className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
          {orgs && orgs.length > 1 && (
            <div className="pb-1 pr-1">
              <label htmlFor="nav-org" className="sr-only">Verein</label>
              <select id="nav-org" value={slug} onChange={(e) => setSlug(e.target.value)} className="h-8 w-full rounded-md border border-border bg-surface px-2 text-xs">
                {orgs.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
              </select>
            </div>
          )}
          {children.map(({ id, label, icon: SubIcon }) => {
            const href = `/verwaltung/${id}`;
            const current = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={id}
                href={href}
                aria-current={current ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                  current ? "bg-brand/15 font-medium text-brand" : "text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                <SubIcon size={15} aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Menuepunkt "Einstellungen" mit aufklappbarem Register (immer offen, solange man in den Einstellungen ist). */
function SettingsGroup({ pathname }: { pathname: string }) {
  const inSettings = pathname.startsWith("/einstellungen") || pathname === "/rechnungen";
  const [open, setOpen] = useState(false);
  const expanded = inSettings || open;
  return (
    <div>
      <div className={clsx("flex items-center rounded-lg", inSettings && "bg-brand/15")}>
        <Link href="/einstellungen/profil" className={clsx(linkClass(false), "flex-1", inSettings && "text-brand hover:bg-transparent")}>
          <Settings size={18} aria-hidden />
          Einstellungen
        </Link>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="einstellungen-register"
          aria-label={expanded ? "Einstellungen einklappen" : "Einstellungen aufklappen"}
          onClick={() => setOpen((o) => !o)}
          className={clsx("mr-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-text", inSettings && "text-brand")}
        >
          <ChevronDown size={16} aria-hidden className={clsx("transition-transform", expanded && "rotate-180")} />
        </button>
      </div>
      {expanded && (
        <div id="einstellungen-register" className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
          {SETTINGS_ITEMS.map(({ href, label, icon: SubIcon }) => {
            const current = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                aria-current={current ? "page" : undefined}
                className={clsx("flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors", current ? "bg-brand/15 font-medium text-brand" : "text-muted hover:bg-surface-2 hover:text-text")}
              >
                <SubIcon size={15} aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Shell({ children, user }: { children: ReactNode; user: PublicUser }) {
  const { unread } = useChat();
  const items = user.isPlatformAdmin ? [...nav, platformItem] : nav;
  const { logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface p-4 md:flex">
        <div className="mb-6 flex items-center justify-between px-2">
          <Logo className="text-lg" />
          <NotificationBell align="left" />
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Hauptnavigation">
          {items.map((item) =>
            item.href === "/verwaltung" ? (
              <VerwaltungGroup key={item.href} item={item} active={isActive(item.href)} pathname={pathname} />
            ) : (
              <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined} className={linkClass(isActive(item.href))}>
                <item.icon size={18} aria-hidden />
                {item.label}
                {item.href === "/chat" && unread > 0 && <UnreadBadge n={unread} />}
              </Link>
            ),
          )}
          <SettingsGroup pathname={pathname} />
        </nav>
        <ThemeToggle compact className="mb-3 self-start" />
        <div className="rounded-lg border border-border p-2">
          <div className="flex items-center gap-3">
            <Avatar name={user.displayName} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.displayName}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => logout().then(() => router.replace("/login"))}>
            <LogOut size={14} aria-hidden /> Abmelden
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-surface px-3 md:hidden">
        <Logo />
        <div className="flex items-center">
          <ThemeCycleButton />
          <NotificationBell />
          <Link href="/einstellungen" aria-label="Einstellungen und Konto" className="ml-1 inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface-2">
            <Avatar name={user.displayName} size={30} />
          </Link>
        </div>
      </header>

      <main className="px-4 py-6 pb-24 md:ml-64 md:px-8 md:pb-10">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>

      <nav
        aria-label="Hauptnavigation"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        className="fixed inset-x-0 bottom-0 z-10 grid border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={clsx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium", isActive(item.href) ? "text-brand" : "text-muted")}
          >
            <span className="relative">
              <item.icon size={20} aria-hidden />
              {item.href === "/chat" && unread > 0 && <UnreadBadge n={unread} floating />}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
