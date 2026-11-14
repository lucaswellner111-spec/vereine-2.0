// Build-Pruefung der Betreiberdaten (Impressum, Datenschutz usw.). Die Liste der Pflichtvariablen wird aus
// lib/legal-config.ts gelesen (eine Quelle).
//  - Immer: stehen noch Platzhalter, nennt der Build sie als HINWEIS (Exit 0), damit sie vor dem Start nicht untergehen.
//  - Mit NEXT_PUBLIC_ALLOW_INDEXING=1 (Launch): Platzhalter brechen den Build ab (Exit 1). LEGAL_STRICT=0 hebt das auf,
//    LEGAL_STRICT=1 erzwingt es auch ohne Indexierung.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("../lib/legal-config.ts", import.meta.url)), "utf8");
const block = /REQUIRED_LEGAL_ENV = \[([\s\S]*?)\] as const/.exec(src)?.[1] ?? "";
const required = [...block.matchAll(/"(NEXT_PUBLIC_LEGAL_[A-Z_]+)"/g)].map((m) => m[1]);

if (required.length === 0) {
  console.error("check-legal: Pflichtvariablen nicht gefunden (lib/legal-config.ts geändert?)");
  process.exit(1);
}
const missing = required.filter((k) => !process.env[k]?.trim());
if (missing.length > 0) {
  const indexing = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "1";
  const strict = process.env.LEGAL_STRICT === "1" || (indexing && process.env.LEGAL_STRICT !== "0");
  const head = indexing
    ? "NEXT_PUBLIC_ALLOW_INDEXING=1, aber im Impressum stehen noch Platzhalter."
    : "Im Impressum und in der Datenschutzerklärung stehen noch Platzhalter (vor dem Start mit den Firmendaten füllen).";
  const log = strict ? console.error : console.warn;
  log(`\n[${strict ? "FEHLER" : "HINWEIS"}] ${head}\nFehlende Variablen: ${missing.join(", ")}\n`);
  if (strict) process.exit(1);
}
