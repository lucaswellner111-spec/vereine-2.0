import { api, ApiError } from "./api";
import type { MediaRef } from "@vereine/shared";

export type MediaVariant = "avatar" | "avatar-sm" | "thumb" | "medium";

/** Bilder werden ueber die API ausgeliefert (Anmeldung + Sichtbarkeitsregeln), nicht ueber oeffentliche URLs. */
export const mediaUrl = (id: string, variant: MediaVariant) => `/api/media/${id}/${variant}`;

/** Laedt ein Bild per multipart hoch (kein JSON). `kind`: "post" (Beitragsbild) oder "avatar". */
export async function uploadImage(kind: "post" | "avatar", file: File): Promise<MediaRef> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/media/${kind}`, { method: "POST", body, credentials: "same-origin" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, typeof data?.message === "string" ? data.message : "Upload fehlgeschlagen.");
  return data as MediaRef;
}

export const removeAvatar = () => api("/media/avatar", { method: "DELETE" });
