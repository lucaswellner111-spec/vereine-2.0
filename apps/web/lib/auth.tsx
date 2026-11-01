"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LoginInput, LoginResult, PublicUser, RegisterInput } from "@vereine/shared";
import { api, ApiError } from "./api";

type AuthState = {
  user: PublicUser | null;
  loading: boolean;
  /** Liefert eine Herausforderung, wenn noch ein zweiter Faktor noetig ist, sonst null (angemeldet). */
  login: (input: LoginInput) => Promise<{ challenge: string } | null>;
  loginTwoFactor: (challenge: string, code: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  clear: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<PublicUser>("/auth/me")
      .then(setUser)
      .catch((err) => {
        if (!(err instanceof ApiError) || err.status !== 401) console.error(err);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const res = await api<LoginResult>("/auth/login", { method: "POST", body: input });
    if ("twoFactorRequired" in res) return { challenge: res.challenge };
    setUser(res);
    return null;
  }, []);

  const loginTwoFactor = useCallback(async (challenge: string, code: string) => {
    setUser(await api<PublicUser>("/auth/login/2fa", { method: "POST", body: { challenge, code } }));
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    await api("/auth/register", { method: "POST", body: input });
    await login({ email: input.email, password: input.password });
  }, [login]);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST", body: {} });
    setUser(null);
  }, []);

  const clear = useCallback(() => setUser(null), []);

  const value = useMemo(
    () => ({ user, loading, login, loginTwoFactor, register, logout, clear }),
    [user, loading, login, loginTwoFactor, register, logout, clear],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth muss innerhalb von AuthProvider genutzt werden");
  return ctx;
}
