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

/** Der Chat-Bereich darf nur seine eigenen Tabellen kennen (er kann auf einen eigenen Server ziehen). */
describe("Chat-Bereich", () => {
  const CHAT_TABLES = ["chat", "conversations", "conversationMembers", "messages", "chatBlocks", "messageReports"];
  it("importiert nur chat-Tabellen aus dem Schema", () => {
    for (const file of sources(join(root, "chat"))) {
      const src = readFileSync(file, "utf8");
      const imports = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\.\/db\/schema"/g)].flatMap((m) =>
        m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean),
      );
      const foreign = imports.filter((i) => !CHAT_TABLES.includes(i));
      expect(foreign, `${file} importiert fremde Tabellen: ${foreign.join(", ")}`).toEqual([]);
    }
  });
});

/** Der Abrechnungs-Bereich kennt nur seine eigenen Tabellen; Vereins-/Nutzerdaten kommen ueber OrgsService/UsersDirectory. */
describe("Billing-Bereich", () => {
  const BILLING_TABLES = ["billing", "invoices", "invoiceItems", "invoiceCounters"];
  it("importiert nur billing-Tabellen aus dem Schema", () => {
    for (const file of sources(join(root, "billing"))) {
      const src = readFileSync(file, "utf8");
      const imports = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\.\/db\/schema"/g)].flatMap((m) =>
        m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean),
      );
      const foreign = imports.filter((i) => !BILLING_TABLES.includes(i));
      expect(foreign, `${file} importiert fremde Tabellen: ${foreign.join(", ")}`).toEqual([]);
    }
  });
});

/** Die Mitgliederverwaltung kennt nur eigene Tabellen (plus das Zugriffsprotokoll ueber AuditService, nicht direkt). */
describe("Mitglieder-Bereich", () => {
  const MEMBER_TABLES = ["membersArea", "feeClasses", "memberProfiles", "memberCounters"];
  it("importiert nur members-Tabellen aus dem Schema", () => {
    for (const file of sources(join(root, "members"))) {
      const src = readFileSync(file, "utf8");
      const imports = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\.\/db\/schema"/g)].flatMap((m) =>
        m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean),
      );
      const foreign = imports.filter((i) => !MEMBER_TABLES.includes(i));
      expect(foreign, `${file} importiert fremde Tabellen: ${foreign.join(", ")}`).toEqual([]);
    }
  });
});
