import { ImageResponse } from "next/og";

// Vorschaubild fuer geteilte Links (WhatsApp, Signal, Mail). Wird beim Build erzeugt, keine Fremd-Requests.
export const alt = "Klubnest – die Plattform für Vereine, Mitglieder und Fans";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#f5f7f5", color: "#14201a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: 96, height: 96, borderRadius: 22, background: "#1b6e45", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, fontWeight: 700 }}>K</div>
          <div style={{ fontSize: 64, fontWeight: 700 }}>Klubnest</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 52, fontWeight: 600, lineHeight: 1.2, maxWidth: 980 }}>Das Social Media für Vereine, Mitglieder und Fans.</div>
        <div style={{ marginTop: 28, fontSize: 30, color: "#556258" }}>Termine, Chat, Mitglieder und Feed · Gehostet in Deutschland · Ohne Tracking</div>
      </div>
    ),
    size,
  );
}
