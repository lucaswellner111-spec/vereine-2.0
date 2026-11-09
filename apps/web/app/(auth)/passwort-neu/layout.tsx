import type { ReactNode } from "react";

export const metadata = { title: "Neues Passwort", robots: { index: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
