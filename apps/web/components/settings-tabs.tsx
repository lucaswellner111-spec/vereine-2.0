import clsx from "clsx";
import Link from "next/link";

const tabs = [
  { href: "/einstellungen/profil", label: "Profil" },
  { href: "/einstellungen/datenschutz", label: "Datenschutz" },
  { href: "/einstellungen/sicherheit", label: "Sicherheit" },
  { href: "/rechnungen", label: "Rechnungen" },
];

export function SettingsTabs({ active }: { active: string }) {
  return (
    <nav aria-label="Einstellungen" className="mb-5 inline-flex rounded-lg border border-border bg-surface p-1">
      {tabs.map((t) => (
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
