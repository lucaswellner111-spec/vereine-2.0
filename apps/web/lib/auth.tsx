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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Jede ausdrueckliche Aenderung (Login, Bestaetigungslink, Logout) erhoeht den Zaehler. Eine spaeter eintreffende
  // Antwort des ersten /auth/me-Aufrufs (noch ohne Cookie gestartet) darf sie nicht ueberschreiben.
  const generation = useRef(0);
  const setUser = useCallback((next: PublicUser | null) => {
    generation.current += 1;
    setUserState(next);
  }, []);

  useEffect(() => {
    const started = generation.current;
    api<PublicUser>("/auth/me")
      .then((u) => {
        if (generation.current === started) setUserState(u);
      })
      .catch((err) => {
        if (!(err instanceof ApiError) || err.status !== 401) console.error(err);
        if (generation.current === started) setUserState(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const res = await api<LoginResult>("/auth/login", { method: "POST", body: input });
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
