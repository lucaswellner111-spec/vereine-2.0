import clsx from "clsx";
import Link from "next/link";
import { SETTINGS_ITEMS } from "@/lib/settings-nav";

/** Nur am Handy sichtbar: am Desktop stehen die Einstellungen als Untermenue in der Seitenleiste. */
export function SettingsTabs({ active }: { active: string }) {
  return (
    <nav aria-label="Einstellungen" className="mb-5 inline-flex max-w-full flex-wrap rounded-lg border border-border bg-surface p-1 md:hidden">
      {SETTINGS_ITEMS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={clsx("rounded-md px-3 py-1.5 text-sm font-medium", t.href === active ? "bg-brand text-brand-contrast" : "text-muted hover:text-text")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
