"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ProfileView } from "@vereine/shared";
import { useApi } from "./use-api";

type MyProfile = { profile: ProfileView | null; reload: () => void };

const MyProfileContext = createContext<MyProfile>({ profile: null, reload: () => undefined });

/** Eigenes Profil (Handle, Avatar) einmal fuer die ganze App-Huelle laden. */
export function MyProfileProvider({ children }: { children: ReactNode }) {
  const me = useApi<ProfileView>("/profiles/me");
  return <MyProfileContext.Provider value={{ profile: me.data, reload: me.reload }}>{children}</MyProfileContext.Provider>;
}

export function useMyProfile(): MyProfile {
  return useContext(MyProfileContext);
}

/** Link aufs eigene Profil; ohne Handle (laedt noch, Fehler) zu den Profil-Einstellungen. */
export function myProfileHref(profile: ProfileView | null): string {
  return profile?.handle ? `/profil/${profile.handle}` : "/einstellungen/profil";
}
