import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLegalConfig, isOmitted, isPlaceholder, legalIndexingWarning, REQUIRED_LEGAL_ENV, unresolvedLegalFields } from "./legal-config";

const FULL_ENV = {
  NEXT_PUBLIC_LEGAL_COMPANY: "Beispiel Klubnest UG",
  NEXT_PUBLIC_LEGAL_FORM: "UG (haftungsbeschränkt)",
  NEXT_PUBLIC_LEGAL_STREET: "Musterstraße 1",
  NEXT_PUBLIC_LEGAL_POSTAL_CITY: "04109 Leipzig",
  NEXT_PUBLIC_LEGAL_REPRESENTATIVES: "Erika Muster (Geschäftsführerin)",
  NEXT_PUBLIC_LEGAL_REGISTER: "Amtsgericht Leipzig, HRB 00000",
  NEXT_PUBLIC_LEGAL_VAT_ID: "-",
  NEXT_PUBLIC_LEGAL_EMAIL: "kontakt@example.test",
  NEXT_PUBLIC_LEGAL_PHONE: "-",
  NEXT_PUBLIC_LEGAL_DPO: "Datenschutz, datenschutz@example.test",
  NEXT_PUBLIC_LEGAL_AUTHORITY: "Sächsische Datenschutz- und Transparenzbeauftragte",
};

describe("legal-config", () => {
  it("ohne Umgebungswerte stehen erkennbare Platzhalter", () => {
    const cfg = buildLegalConfig({});
    expect(cfg.companyName).toBe("[… Firmenname …]");
    expect(isPlaceholder(cfg.email)).toBe(true);
    expect(cfg.country).toBe("Deutschland");
    // DSA-Adresse folgt der allgemeinen Adresse
    expect(cfg.dsaEmail).toBe(cfg.email);
    expect(unresolvedLegalFields(cfg)).toEqual(expect.arrayContaining(["companyName", "email", "register", "authority", "dpoContact"]));
  });

  it("mit allen Werten bleibt kein Platzhalter; \"-\" blendet optionale Felder aus", () => {
    const cfg = buildLegalConfig(FULL_ENV);
    expect(unresolvedLegalFields(cfg)).toEqual([]);
    expect(isOmitted(cfg.vatId)).toBe(true);
    expect(isOmitted(cfg.phone)).toBe(true);
    expect(buildLegalConfig({ ...FULL_ENV, NEXT_PUBLIC_LEGAL_DSA_EMAIL: "dsa@example.test" }).dsaEmail).toBe("dsa@example.test");
  });

  it("Warnung nur bei NEXT_PUBLIC_ALLOW_INDEXING=1 und fehlenden Werten", () => {
    expect(legalIndexingWarning({})).toBeNull();
    expect(legalIndexingWarning({ NEXT_PUBLIC_ALLOW_INDEXING: "0" })).toBeNull();
    const warn = legalIndexingWarning({ NEXT_PUBLIC_ALLOW_INDEXING: "1", NEXT_PUBLIC_LEGAL_COMPANY: "X" });
    expect(warn).toMatch(/Platzhalter/);
    expect(warn).toContain("NEXT_PUBLIC_LEGAL_EMAIL");
    expect(warn).not.toContain("NEXT_PUBLIC_LEGAL_COMPANY");
    expect(legalIndexingWarning({ ...FULL_ENV, NEXT_PUBLIC_ALLOW_INDEXING: "1" })).toBeNull();
  });

  it("Build-Skript (scripts/check-legal.mjs) warnt bei Indexierung mit Platzhaltern und liest dieselbe Pflichtliste", () => {
    const script = join(__dirname, "..", "scripts", "check-legal.mjs");
    const run = (env: Record<string, string>) =>
      spawnSync(process.execPath, [script], { env: { ...process.env, NEXT_PUBLIC_ALLOW_INDEXING: "", LEGAL_STRICT: "", ...Object.fromEntries(REQUIRED_LEGAL_ENV.map((k) => [k, ""])), ...env }, encoding: "utf8" });

    const quiet = run({});
    expect(quiet.status).toBe(0);
    expect(quiet.stderr).toBe("");

    const warned = run({ NEXT_PUBLIC_ALLOW_INDEXING: "1" });
    expect(warned.status).toBe(0);
    for (const k of REQUIRED_LEGAL_ENV) expect(warned.stderr, k).toContain(k);

    expect(run({ NEXT_PUBLIC_ALLOW_INDEXING: "1", LEGAL_STRICT: "1" }).status).toBe(1);
    expect(run({ ...FULL_ENV, NEXT_PUBLIC_ALLOW_INDEXING: "1", LEGAL_STRICT: "1" }).status).toBe(0);
  }, 60_000); // fuenf Node-Starts, auf einer ausgelasteten Maschine langsam
});
