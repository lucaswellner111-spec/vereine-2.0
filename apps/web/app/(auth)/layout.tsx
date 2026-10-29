import type { ReactNode } from "react";
import { Logo } from "@/components/site";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-6 text-lg" />
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm">{children}</div>
    </main>
  );
}
