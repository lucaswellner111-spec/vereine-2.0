"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LoginInput, LoginResult, PublicUser, RegisterInput } from "@vereine/shared";
import { api, ApiError } from "./api";

type AuthState = {
  user: PublicUser | null;
  loading: boolean;
  /** Liefert eine Herausforderung, wenn noch ein zweiter Faktor noetig ist, sonst null (angemeldet). */
  login: (input: LoginInput) => Promise<{ challenge: string } | null>;
  loginTwoFactor: (challenge: string, code: string) => Promise<void>;
  /** Legt das Konto an; angemeldet wird erst ueber den Link in der Bestaetigungs-Mail (gegen Konto-Enumeration). */
  register: (input: RegisterInput) => Promise<void>;
  /** Nach Bestaetigungslink o. ae.: Nutzer neu laden bzw. direkt setzen. */
  refresh: () => Promise<void>;
  setUser: (user: PublicUser | null) => void;
  logout: () => Promise<void>;
  clear: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

/*
 * Merker "hier war schon eine Anmeldung" (nur im Browser, kein Inhalt). Auf oeffentlichen Seiten ohne Merker wird
 * /auth/me gar nicht erst gefragt: ein anonymer Besuch erzeugt so keinen 401 (Konsolenfehler, Monitoring-Rauschen,
 * unnoetige Last). Auf App-Seiten wird immer gefragt, der Merker ist also nie die Quelle der Wahrheit.
 */
const SESSION_HINT_KEY = "kn-session";
const PUBLIC_PATHS = ["/", "/login", "/registrieren", "/passwort-vergessen", "/warteliste", "/vereine-finden", "/hilfe", "/kontakt", "/agb", "/datenschutz", "/impressum", "/barrierefreiheit", "/community-richtlinien", "/meldeverfahren"];
const isPublicPath = (path: string) => PUBLIC_PATHS.includes(path) || path.startsWith("/verein/") || path.startsWith("/warteliste/");
function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === "1";
  } catch {
    return false;
  }
}
function setSessionHint(on: boolean) {
  try {
    if (on) localStorage.setItem(SESSION_HINT_KEY, "1");
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    /* Speicher gesperrt: ohne Merker wird auf oeffentlichen Seiten einfach nicht gefragt */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Jede ausdrueckliche Aenderung (Login, Bestaetigungslink, Logout) erhoeht den Zaehler. Eine spaeter eintreffende
  // Antwort des ersten /auth/me-Aufrufs (noch ohne Cookie gestartet) darf sie nicht ueberschreiben.
  const generation = useRef(0);
  const setUser = useCallback((next: PublicUser | null) => {
    generation.current += 1;
    setSessionHint(next !== null);
    setUserState(next);
  }, []);

  useEffect(() => {
    const started = generation.current;
    if (!hasSessionHint() && isPublicPath(window.location.pathname)) {
      setLoading(false);
      return;
    }
    api<PublicUser>("/auth/me")
      .then((u) => {
        if (generation.current === started) {
          setSessionHint(true);
          setUserState(u);
        }
      })
      .catch((err) => {
        if (!(err instanceof ApiError) || err.status !== 401) console.error(err);
        if (generation.current === started) {
          setSessionHint(false);
          setUserState(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const res = await api<LoginResult>("/auth/login", { method: "POST", body: input, captcha: true });
    if ("twoFactorRequired" in res) return { challenge: res.challenge };
    setUser(res);
    return null;
  }, [setUser]);

  const loginTwoFactor = useCallback(async (challenge: string, code: string) => {
    setUser(await api<PublicUser>("/auth/login/2fa", { method: "POST", body: { challenge, code } }));
  }, [setUser]);

  const register = useCallback(async (input: RegisterInput) => {
    await api("/auth/register", { method: "POST", body: input });
  }, []);

  const refresh = useCallback(async () => {
    try {
      setUser(await api<PublicUser>("/auth/me"));
    } catch {
      setUser(null);
    }
  }, [setUser]);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST", body: {} });
    setUser(null);
  }, [setUser]);

  const clear = useCallback(() => setUser(null), [setUser]);

  const value = useMemo(
    () => ({ user, loading, login, loginTwoFactor, register, refresh, setUser, logout, clear }),
    [user, loading, login, loginTwoFactor, register, refresh, setUser, logout, clear],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth muss innerhalb von AuthProvider genutzt werden");
  return ctx;
}
