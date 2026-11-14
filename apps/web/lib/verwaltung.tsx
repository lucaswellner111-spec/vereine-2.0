"use client";

import {
  Building2,
  CalendarDays,
  FileSignature,
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
  { id: "vertrag", label: "Vertrag zur Auftragsverarbeitung", icon: FileSignature, roles: ["admin", "treasurer"] },
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
  /** Liste der verwaltbaren Vereine neu laden (nach Gruendung, Rollenwechsel). */
  reloadOrgs: () => void;
  /** Fehler beim Laden der Vereinsliste (orgs bleibt dann null); Seiten zeigen "Erneut versuchen". */
  orgsError: string | null;
  error: string | null;
  setError: (message: string | null) => void;
};

const VerwaltungContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "verwaltung-org";

/** Laedt die verwaltbaren Vereine (beim Start und per reloadOrgs); Seitenleiste und Unterseiten teilen sich Auswahl und Rolle. */
export function VerwaltungProvider({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [slug, setSlugState] = useState("");
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orgsError, setOrgsError] = useState<string | null>(null);
  const pathname = usePathname();

  // Fehler gehoeren zur Seite bzw. zum Verein: beim Wechsel zuruecksetzen
  useEffect(() => setError(null), [pathname, slug]);

  // Laedt die verwaltbaren Vereine; die bisherige Auswahl bleibt, wenn es den Verein noch gibt.
  // Erneut aufrufen, wenn sich Rollen aendern (z. B. nach "Verein gruenden"), damit die Navigation ohne Reload passt.
  const reloadOrgs = useCallback(() => {
    setOrgsError(null);
    api<OrgSummary[]>("/orgs/managed")
      .then((list) => {
        setOrgs(list);
        setSlugState((current) => {
          if (current && list.some((o) => o.slug === current)) return current;
          let wanted = "";
          try {
            wanted = new URLSearchParams(window.location.search).get("verein") ?? localStorage.getItem(STORAGE_KEY) ?? "";
          } catch {
            /* localStorage nicht verfuegbar */
          }
          return list.some((o) => o.slug === wanted) ? wanted : (list[0]?.slug ?? "");
        });
      })
      // Nicht als "keine Vereine" werten: Fehler merken, vorhandene Liste behalten
      .catch((e) => setOrgsError(describeError(e)));
  }, []);

  useEffect(() => reloadOrgs(), [reloadOrgs]);

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
    () => ({ orgs, slug, setSlug, detail, role: detail?.viewer.role ?? null, refresh, reloadOrgs, orgsError, error, setError }),
    [orgs, slug, setSlug, detail, refresh, reloadOrgs, orgsError, error],
  );
  return <VerwaltungContext.Provider value={value}>{children}</VerwaltungContext.Provider>;
}

export function useVerwaltung(): Ctx {
  const ctx = useContext(VerwaltungContext);
  if (!ctx) throw new Error("useVerwaltung muss innerhalb von VerwaltungProvider genutzt werden");
  return ctx;
}
