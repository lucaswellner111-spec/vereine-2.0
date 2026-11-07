"use client";

import {
  Building2,
  CalendarDays,
  Flag,
  LayoutDashboard,
  Link2,
  Receipt,
  ShieldCheck,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { OrgDetail, OrgRole, OrgSummary } from "@vereine/shared";
import { api, describeError } from "./api";

/** Unterpunkte der Verwaltung: ein Eintrag = eine Seite unter /verwaltung/<id> und ein Punkt im Seitenmenue. */
export type VerwaltungItem = { id: string; label: string; icon: LucideIcon; roles: OrgRole[] };

export const VERWALTUNG_ITEMS: VerwaltungItem[] = [
  { id: "uebersicht", label: "Übersicht", icon: LayoutDashboard, roles: ["admin", "treasurer"] },
  { id: "antraege", label: "Anträge", icon: UserPlus, roles: ["admin"] },
  { id: "mitglieder", label: "Mitglieder", icon: Users, roles: ["admin", "treasurer"] },
  { id: "rollen", label: "Rollen", icon: ShieldCheck, roles: ["admin"] },
  { id: "beitraege", label: "Beiträge", icon: Wallet, roles: ["admin", "treasurer"] },
  { id: "einladungen", label: "Einladungen", icon: Link2, roles: ["admin"] },
  { id: "teams", label: "Teams", icon: UsersRound, roles: ["admin"] },
  { id: "termine", label: "Termine", icon: CalendarDays, roles: ["admin", "moderator"] },
  { id: "moderation", label: "Moderation", icon: Flag, roles: ["admin", "moderator"] },
  { id: "rechnungen", label: "Rechnungen", icon: Receipt, roles: ["admin", "treasurer"] },
  { id: "vereinsdaten", label: "Vereinsdaten", icon: Building2, roles: ["admin", "treasurer"] },
];

export const itemsForRole = (role: OrgRole | null | undefined) => (role ? VERWALTUNG_ITEMS.filter((i) => i.roles.includes(role)) : []);

type Ctx = {
  /** Vereine mit Verwaltungsrolle (null = wird geladen). */
  orgs: OrgSummary[] | null;
  slug: string;
  setSlug: (slug: string) => void;
  detail: OrgDetail | null;
  role: OrgRole | null;
  refresh: () => void;
  error: string | null;
  setError: (message: string | null) => void;
};

const VerwaltungContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "verwaltung-org";

/** Laedt einmal die verwaltbaren Vereine; Seitenleiste und Unterseiten teilen sich Auswahl und Rolle. */
export function VerwaltungProvider({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [slug, setSlugState] = useState("");
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();

  // Fehler gehoeren zur Seite bzw. zum Verein: beim Wechsel zuruecksetzen
  useEffect(() => setError(null), [pathname, slug]);

  useEffect(() => {
    api<OrgSummary[]>("/orgs/managed")
      .then((list) => {
        setOrgs(list);
        let wanted = "";
        try {
          wanted = new URLSearchParams(window.location.search).get("verein") ?? localStorage.getItem(STORAGE_KEY) ?? "";
        } catch {
          /* localStorage nicht verfuegbar */
        }
        setSlugState(list.some((o) => o.slug === wanted) ? wanted : (list[0]?.slug ?? ""));
      })
      .catch(() => setOrgs([]));
  }, []);

  const setSlug = useCallback((next: string) => {
    setSlugState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* nur fuer diese Sitzung */
    }
  }, []);

  const refresh = useCallback(() => {
    if (!slug) return;
    api<OrgDetail>(`/orgs/${slug}`).then(setDetail).catch((e) => setError(describeError(e)));
  }, [slug]);

  useEffect(() => {
    setDetail(null);
    refresh();
  }, [refresh]);

  const value = useMemo<Ctx>(
    () => ({ orgs, slug, setSlug, detail, role: detail?.viewer.role ?? null, refresh, error, setError }),
    [orgs, slug, setSlug, detail, refresh, error],
  );
  return <VerwaltungContext.Provider value={value}>{children}</VerwaltungContext.Provider>;
}

export function useVerwaltung(): Ctx {
  const ctx = useContext(VerwaltungContext);
  if (!ctx) throw new Error("useVerwaltung muss innerhalb von VerwaltungProvider genutzt werden");
  return ctx;
}
