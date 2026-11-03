import { Bell, CalendarDays, Building2, Receipt, ShieldCheck, User, Lock, type LucideIcon } from "lucide-react";

/** Unterpunkte der Einstellungen (Seitenleiste am Desktop, Tab-Leiste am Handy). */
export const SETTINGS_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/einstellungen/profil", label: "Profil", icon: User },
  { href: "/einstellungen/datenschutz", label: "Datenschutz", icon: ShieldCheck },
  { href: "/einstellungen/sicherheit", label: "Sicherheit", icon: Lock },
  { href: "/einstellungen/vereinsdaten", label: "Vereinsdaten", icon: Building2 },
  { href: "/einstellungen/mitteilungen", label: "Mitteilungen", icon: Bell },
  { href: "/einstellungen/kalender", label: "Kalender", icon: CalendarDays },
  { href: "/rechnungen", label: "Rechnungen", icon: Receipt },
];
