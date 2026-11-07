import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { RegisterServiceWorker } from "@/components/pwa";
import { UiHosts } from "@/components/ui-hosts";
import { AuthProvider } from "@/lib/auth";
import { ALLOW_INDEXING, SITE_DESCRIPTION, SITE_URL } from "@/lib/site-meta";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Klubnest", template: "%s · Klubnest" },
  description: SITE_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Klubnest", statusBarStyle: "default" },
  openGraph: { type: "website", locale: "de_DE", siteName: "Klubnest", title: "Klubnest", description: SITE_DESCRIPTION },
  // Vorschau mit Testdaten: nicht in Suchmaschinen aufnehmen, bis NEXT_PUBLIC_ALLOW_INDEXING=1 gesetzt ist
  robots: ALLOW_INDEXING ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = {
  // cover: env(safe-area-inset-*) liefert auf iOS echte Werte (Notch, Home-Leiste);
  // resizes-content: die Bildschirmtastatur verkleinert den Inhalt statt ihn zu ueberdecken.
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1410" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <RegisterServiceWorker />
        <UiHosts />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
