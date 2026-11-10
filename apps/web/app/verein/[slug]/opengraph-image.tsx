import { ImageResponse } from "next/og";
import type { PublicOrg } from "@vereine/shared";
import { fetchPublic, RATE_LIMITED, rateLimited } from "@/lib/public-api";
import { truncateText } from "@/lib/story";

/*
 * Vorschaubild der oeffentlichen Vereinsseite (WhatsApp, Signal, Instagram-Link). Nur Daten, die die Seite
 * ohnehin oeffentlich zeigt (public-Modul): Name, Kategorie, Ort, Beschreibung, naechster oeffentlicher Termin.
 * Keine Personendaten. Das Logo wird nicht eingebettet (Medien liegen als WebP vor, das der OG-Renderer
 * nicht sicher kann); stattdessen der Anfangsbuchstabe. Keine Fremd-Requests, eingebaute Schrift.
 */
export const alt = "Vereinsseite auf Klubnest";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SLUG = /^[a-z0-9-]{1,80}$/;
const tz = "Europe/Berlin";

export default async function OrgOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = SLUG.test(slug) ? await fetchPublic<PublicOrg>(`/orgs/${encodeURIComponent(slug)}`).catch(rateLimited).catch(() => null) : null;
  const found = org && org !== RATE_LIMITED ? org : null;
  const next = found?.events[0];
  const nextLabel = next
    ? `${new Date(next.startsAt).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", timeZone: tz })} · ${truncateText(next.title, 50)}`
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "#fff",
          background: "linear-gradient(135deg, #0e4a2d 0%, #1b6e45 55%, #0f7a5a 100%)",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: -220, right: -180, width: 620, height: 620, borderRadius: 620, background: "radial-gradient(circle, rgba(198,243,107,0.45) 0%, rgba(198,243,107,0) 70%)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#fff", color: "#1b6e45", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>K</div>
          Klubnest
        </div>
        {found ? (
          <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
            <div style={{ width: 168, height: 168, flexShrink: 0, borderRadius: 40, background: "#c6f36b", color: "#07140d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 104 }}>
              {found.name.trim().charAt(0).toUpperCase() || "V"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 840 }}>
              <div style={{ fontSize: found.name.length > 32 ? 58 : 76, lineHeight: 1.05, letterSpacing: -1.5 }}>{truncateText(found.name, 60)}</div>
              <div style={{ fontSize: 32, color: "rgba(255,255,255,0.82)" }}>{`${found.category} · ${found.city}`}</div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 64, lineHeight: 1.15, maxWidth: 980 }}>Das Social Media für Vereine, Mitglieder und Fans.</div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 30 }}>
          {nextLabel ? (
            <>
              <div style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "#c6f36b", color: "#07140d" }}>Nächster Termin</div>
              <div style={{ display: "flex" }}>{nextLabel}</div>
            </>
          ) : (
            <div style={{ display: "flex", color: "rgba(255,255,255,0.85)" }}>{found?.about ? truncateText(found.about, 90) : "Gehostet in Deutschland · Ohne Tracking"}</div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
