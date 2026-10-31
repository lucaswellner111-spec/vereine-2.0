import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architekturregel (docs/ARCHITEKTUR.md): Bereiche greifen nicht direkt auf Tabellen anderer Bereiche zu.
 * `social` (orgs, posts, events, notifications) darf die identity-Tabellen nur ueber UsersDirectory lesen.
 * Dieser Test bricht, sobald jemand wieder `users`, `sessions`, `consents` oder `auditLog` importiert.
 */
const root = join(__dirname, "..");
const SOCIAL_MODULES = ["orgs", "posts", "events", "notifications"];
const IDENTITY_TABLES = ["users", "sessions", "consents", "auditLog"];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return e.name.endsWith(".ts") && !e.name.endsWith(".spec.ts") ? [p] : [];
  });
}

describe("Bereichsgrenzen", () => {
  for (const mod of SOCIAL_MODULES) {
    it(`${mod}: kein direkter Zugriff auf identity-Tabellen`, () => {
      for (const file of sources(join(root, mod))) {
        const src = readFileSync(file, "utf8");
        const imports = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\.\/db\/schema"/g)].flatMap((m) =>
          m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]),
        );
        const forbidden = imports.filter((i) => IDENTITY_TABLES.includes(i));
        expect(forbidden, `${file} importiert identity-Tabellen: ${forbidden.join(", ")}`).toEqual([]);
      }
    });
  }
});
