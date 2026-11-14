// Build-Warnung: Soll die Seite indexiert werden (NEXT_PUBLIC_ALLOW_INDEXING=1), duerfen im Impressum keine
// Platzhalter mehr stehen. Die Liste der Pflichtvariablen wird aus lib/legal-config.ts gelesen (eine Quelle).
// Die Pruefung warnt nur (Exit 0); mit LEGAL_STRICT=1 bricht sie den Build ab.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("../lib/legal-config.ts", import.meta.url)), "utf8");
const block = /REQUIRED_LEGAL_ENV = \[([\s\S]*?)\] as const/.exec(src)?.[1] ?? "";
const required = [...block.matchAll(/"(NEXT_PUBLIC_LEGAL_[A-Z_]+)"/g)].map((m) => m[1]);

if (required.length === 0) {
  console.error("check-legal: Pflichtvariablen nicht gefunden (lib/legal-config.ts geändert?)");
  process.exit(1);
}
if (process.env.NEXT_PUBLIC_ALLOW_INDEXING === "1") {
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    console.warn(`\n[WARNUNG] NEXT_PUBLIC_ALLOW_INDEXING=1, aber im Impressum stehen noch Platzhalter.\nFehlende Variablen: ${missing.join(", ")}\n`);
    if (process.env.LEGAL_STRICT === "1") process.exit(1);
  }
}
