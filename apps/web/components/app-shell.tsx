"use client";

import clsx from "clsx";
import { Building2, CalendarDays, ChevronDown, Flag, Search, LayoutDashboard, LogOut, Menu, MessageSquare, Newspaper, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { PublicUser } from "@vereine/shared";
import { useAuth } from "@/lib/auth";
import { ChatProvider, useChat } from "@/lib/chat";
import { SETTINGS_ITEMS } from "@/lib/settings-nav";
import { ShellChromeProvider, useShellChrome } from "@/lib/shell";
import { itemsForRole, useVerwaltung, VerwaltungProvider } from "@/lib/verwaltung";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { MobileMoreSheet } from "./mobile-more-sheet";
import { NotificationBell } from "./notification-bell";
import { ThemeCycleButton, ThemeToggle } from "./theme-toggle";
import { Logo } from "./site";
import { Avatar, Button, Select, Skeleton } from "./ui";

type NavItem = { href: string; label: string; icon: LucideIcon };

const nav: NavItem[] = [
  { href: "/feed", label: "Feed", icon: Newspaper },
  { href: "/vereine", label: "Vereine", icon: Building2 },
  { href: "/kalender", label: "Kalender", icon: CalendarDays },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/verwaltung", label: "Verwaltung", icon: LayoutDashboard },
];

const platformItem: NavItem = { href: "/plattform", label: "Plattform", icon: Flag };

/** Bottom-Nav am Handy: fest vier Bereiche plus "Mehr" (5 Spalten, lesbare Beschriftung). */
const mobileNav: NavItem[] = nav.filter((i) => i.href !== "/verwaltung");

const linkClass = (active: boolean) =>
  clsx(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    active ? "bg-brand/15 text-brand" : "text-muted hover:bg-surface-2 hover:text-text",
  );

/** Zaehler am Chat-Link: Zahl nur optisch, vorgelesen wird ", n ungelesen" als Teil des Link-Namens. */
function UnreadBadge({ n, floating }: { n: number; floating?: boolean }) {
  return (
    <>
      <span
        aria-hidden
        className={clsx(
          "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold leading-none text-on-danger",
          floating ? "absolute -right-3 -top-1.5" : "ml-auto",
        )}
      >
        {n > 9 ? "9+" : n}
      </span>
      <span className="sr-only">, {n} ungelesen</span>
    </>
  );
}

/** Bereiche, die am Handy unter "Mehr" liegen (dort ist "Mehr" der aktuelle Bereich). */
const MORE_PREFIXES = ["/verwaltung", "/einstellungen", "/rechnungen", "/personen", "/plattform", "/spenden"];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status" aria-label="Lade">
        <Logo className="text-lg" />
        <Skeleton className="h-2 w-40 rounded-full" />
      </div>
    );
  }

  // Die Chat-Verbindung und die Verwaltungs-Auswahl werden erst fuer angemeldete Nutzer aufgebaut.
  return (
    <ChatProvider>
      <VerwaltungProvider>
        <ShellChromeProvider>
          <Shell user={user}>{children}</Shell>
        </ShellChromeProvider>
        <CommandPalette />
      </VerwaltungProvider>
    </ChatProvider>
  );
}

type SubItem = { href: string; label: string; icon: LucideIcon };

/**
 * Menuepunkt mit aufklappbarem Register der Unterpunkte. Solange man im Bereich ist (active),
 * ist das Register immer offen; sonst klappt es per Knopf auf (Zustand bleibt beim Navigieren erhalten).
 * Ohne Unterpunkte gibt es keinen Aufklapp-Knopf.
 */
function NavGroup({
  id,
  href,
  label,
  icon: Icon,
  active,
  currentHref,
  items,
  header,
}: {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** aktueller Pfad, um den Hauptlink als aktuelle Seite zu markieren */
  currentHref?: string;
  items: SubItem[];
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const expanded = active || open;
  const pathname = usePathname();
  const hasItems = items.length > 0;

  return (
    <div>
      <div className={clsx("flex items-center rounded-lg", active && "bg-brand/15")}>
        <Link href={href} aria-current={currentHref === href ? "page" : undefined} className={clsx(linkClass(false), "flex-1", active && "text-brand hover:bg-transparent")}>
          <Icon size={18} aria-hidden />
          {label}
        </Link>
        {hasItems && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`${id}-register`}
            aria-label={expanded ? `${label} einklappen` : `${label} aufklappen`}
            onClick={() => setOpen((o) => !o)}
            className={clsx("mr-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-text", active && "text-brand")}
          >
            <ChevronDown size={16} aria-hidden className={clsx("transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
      {expanded && hasItems && (
        <div id={`${id}-register`} className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
          {header}
          {items.map(({ href: subHref, label: subLabel, icon: SubIcon }) => {
            const current = pathname === subHref || pathname.startsWith(subHref + "/");
            return (
              <Link
                key={subHref}
                href={subHref}
                aria-current={current ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                  current ? "bg-brand/15 font-medium text-brand" : "text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                <SubIcon size={15} aria-hidden />
                {subLabel}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Verwaltung: Unterpunkte je nach Rolle, Vereinsauswahl nur bei mehr als einem Verein. */
function VerwaltungNav({ item, active, pathname }: { item: NavItem; active: boolean; pathname: string }) {
  const { orgs, slug, setSlug, role } = useVerwaltung();
  const items = itemsForRole(role).map((i) => ({ href: `/verwaltung/${i.id}`, label: i.label, icon: i.icon }));
  const header =
    orgs && orgs.length > 1 ? (
      <div className="pb-1 pr-1">
        <label htmlFor="nav-org" className="sr-only">Verein</label>
        <Select id="nav-org" size="sm" value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full">
          {orgs.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
        </Select>
      </div>
    ) : null;
  return <NavGroup id="verwaltung" href={item.href} label={item.label} icon={item.icon} active={active} currentHref={pathname} items={items} header={header} />;
}

function Shell({ children, user }: { children: ReactNode; user: PublicUser }) {
  const { unread } = useChat();
  const { orgs } = useVerwaltung();
  const { immersive } = useShellChrome();
  // Verwaltung nur mit Verwaltungsrolle; solange die Liste laedt (null), ausgeblendet
  const showVerwaltung = (orgs?.length ?? 0) > 0;
  const showPlattform = !!user.isPlatformAdmin;
  const items = [...nav.filter((i) => i.href !== "/verwaltung" || showVerwaltung), ...(showPlattform ? [platformItem] : [])];
  const { logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const moreActive = MORE_PREFIXES.some(isActive);
  const doLogout = () => {
    setMoreOpen(false);
    void logout().then(() => router.replace("/login"));
  };

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface p-4 md:flex">
        <div className="mb-6 flex items-center justify-between px-2">
          <Logo className="text-lg" />
          <NotificationBell align="left" />
        </div>
        <button
          type="button"
          onClick={openCommandPalette}
          className="mb-3 flex h-9 items-center gap-2 rounded-lg border border-border bg-bg px-3 text-sm text-muted hover:text-text"
        >
          <Search size={15} aria-hidden />
          <span className="flex-1 text-left">Suchen …</span>
          <kbd className="rounded border border-border px-1.5 text-[11px]">Strg K</kbd>
        </button>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Hauptnavigation">
          {items.map((item) =>
            item.href === "/verwaltung" ? (
              <VerwaltungNav key={item.href} item={item} active={isActive(item.href)} pathname={pathname} />
            ) : (
              <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined} className={linkClass(isActive(item.href))}>
                <item.icon size={18} aria-hidden />
                {item.label}
                {item.href === "/chat" && unread > 0 && <UnreadBadge n={unread} />}
              </Link>
            ),
          )}
          <NavGroup
            id="einstellungen"
            href="/einstellungen/profil"
            label="Einstellungen"
            icon={Settings}
            active={pathname.startsWith("/einstellungen") || pathname === "/rechnungen"}
            items={SETTINGS_ITEMS}
          />
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
          <Button variant="ghost" size="sm" className="w-full" onClick={doLogout}>
            <LogOut size={14} aria-hidden /> Abmelden
          </Button>
        </div>
      </aside>

      <header
        className={clsx(
          "sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-surface pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] md:hidden",
          immersive && "max-md:hidden",
        )}
      >
        <Logo />
        <div className="flex items-center">
          <button type="button" onClick={openCommandPalette} aria-label="Suchen" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
            <Search size={20} aria-hidden />
          </button>
          <ThemeCycleButton />
          <NotificationBell />
          <Link href="/einstellungen" aria-label="Einstellungen und Konto" className="ml-1 inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface-2">
            <Avatar name={user.displayName} size={30} />
          </Link>
        </div>
      </header>

      <main
        className={clsx(
          "md:ml-64 md:px-8 md:py-6 md:pb-10",
          // immersiv (z. B. Chat-Vollbild am Handy): ohne Innenabstand, Kopfleiste und Bottom-Nav ausgeblendet
          immersive
            ? "max-md:p-0"
            : "py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
        )}
      >
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>

      <nav
        aria-label="Hauptnavigation"
        className={clsx(
          "fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:hidden",
          immersive && "max-md:hidden",
        )}
      >
        {mobileNav.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={clsx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium leading-tight", active ? "text-brand" : "text-muted")}
            >
              <span className="relative">
                <item.icon size={20} aria-hidden />
                {item.href === "/chat" && unread > 0 && <UnreadBadge n={unread} floating />}
              </span>
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
          className={clsx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium leading-tight", moreActive ? "text-brand" : "text-muted")}
        >
          <Menu size={20} aria-hidden />
          Mehr
          {moreActive && <span className="sr-only">, aktueller Bereich</span>}
        </button>
      </nav>

      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        user={user}
        showVerwaltung={showVerwaltung}
        showPlattform={showPlattform}
        onLogout={doLogout}
      />
    </div>
  );
}
