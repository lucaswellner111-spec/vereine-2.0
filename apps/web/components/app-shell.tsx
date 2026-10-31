"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { PublicUser } from "@vereine/shared";
import { useAuth } from "@/lib/auth";
import { ChatProvider, useChat } from "@/lib/chat";
import { NotificationBell } from "./notification-bell";
import { Logo } from "./site";
import { Avatar, Button } from "./ui";

const nav = [
  { href: "/feed", label: "Feed", icon: "◧" },
  { href: "/vereine", label: "Vereine", icon: "◎" },
  { href: "/kalender", label: "Kalender", icon: "▦" },
  { href: "/chat", label: "Chat", icon: "✉" },
  { href: "/spenden", label: "Spenden", icon: "♡" },
  { href: "/verwaltung", label: "Verwaltung", icon: "▤" },
];

const platformItem = { href: "/plattform", label: "Plattform", icon: "⚑" };

function UnreadBadge({ n, floating }: { n: number; floating?: boolean }) {
  return (
    <span
      aria-label={`${n} ungelesene Nachrichten`}
      className={clsx(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white",
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

  // Die Chat-Verbindung wird erst fuer angemeldete Nutzer aufgebaut.
  return (
    <ChatProvider>
      <Shell user={user}>{children}</Shell>
    </ChatProvider>
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
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-surface p-4 md:flex">
        <div className="mb-6 flex items-center justify-between px-2">
          <Logo className="text-lg" />
          <NotificationBell align="left" />
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Hauptnavigation">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href) ? "bg-brand/15 text-brand" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <span aria-hidden className="w-4 text-center">{item.icon}</span>
              {item.label}
              {item.href === "/chat" && unread > 0 && <UnreadBadge n={unread} />}
            </Link>
          ))}
        </nav>
        <div className="rounded-lg border border-border p-2">
          <div className="flex items-center gap-3">
            <Avatar name={user.displayName} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.displayName}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
          </div>
          <Link href="/einstellungen/profil" className="mt-2 block rounded-lg px-3 py-1.5 text-center text-xs text-muted hover:bg-surface-2 hover:text-text">
            Profil & Konto
          </Link>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => logout().then(() => router.replace("/login"))}>
            Abmelden
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur md:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <NotificationBell />
          <Link href="/einstellungen/profil" aria-label="Profil und Konto" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
            <span aria-hidden>⚙</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => logout().then(() => router.replace("/login"))}>
            Abmelden
          </Button>
        </div>
      </header>

      <main className="px-4 py-6 pb-24 md:ml-60 md:px-8 md:pb-10">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>

      <nav
        aria-label="Hauptnavigation"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        className="fixed inset-x-0 bottom-0 z-10 grid border-t border-border bg-surface md:hidden"
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={clsx(
              "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium",
              isActive(item.href) ? "text-brand" : "text-muted",
            )}
          >
            <span aria-hidden className="relative text-base leading-none">
              {item.icon}
              {item.href === "/chat" && unread > 0 && <UnreadBadge n={unread} floating />}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
