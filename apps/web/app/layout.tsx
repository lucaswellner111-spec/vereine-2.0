import type { ReactNode } from "react";

export const metadata = {
  title: "Vereine 2.0",
  description: "Die datenschutzfreundliche Plattform für Vereine, Mitglieder und Fans.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
