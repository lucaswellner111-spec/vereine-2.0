import { AVV_DOCUMENT, AVV_VERSIONS, avvToMarkdown } from "@vereine/shared";
import { describe, expect, it } from "vitest";
import { avvGraceUntil, avvHash } from "./avv.service";

/**
 * Je Fassung wird der SHA-256-Hash des gerenderten Textes festgehalten. Wer den Text aendert, ohne die Version zu erhoehen,
 * bricht diesen Test: akzeptierte Zustimmungen verweisen auf Version + Hash und muessen den Text eindeutig belegen.
 * Bei neuer Fassung: Version erhoehen, neuen Eintrag UNTEN ergaenzen, die alte Fassung in AVV_VERSIONS behalten.
 */
const PINNED: Record<string, string> = {
  "2026-11-13-entwurf-1": "92ab91f5fa2330ed34f591a04db2e6801ae6488072124cbfcca9bfd2f7dd8e19",
};

describe("AVV-Dokument", () => {
  it("Text und Version gehoeren zusammen (Hash je Version festgehalten)", () => {
    for (const doc of AVV_VERSIONS) expect(avvHash(doc), `Hash der Fassung ${doc.version}`).toBe(PINNED[doc.version]);
  });

  it("aktuelle Fassung ist die letzte Version, hat eindeutige Versionsnummern und ist als Entwurf gekennzeichnet", () => {
    expect(AVV_VERSIONS.at(-1)).toBe(AVV_DOCUMENT);
    expect(new Set(AVV_VERSIONS.map((d) => d.version)).size).toBe(AVV_VERSIONS.length);
    const md = avvToMarkdown(AVV_DOCUMENT);
    if (AVV_DOCUMENT.status === "draft") expect(md).toMatch(/Platzhalter, Anwaltsprüfung ausstehend/);
  });

  it("enthaelt die geforderten Abschnitte inkl. Unterauftragsverarbeitern", () => {
    const md = avvToMarkdown(AVV_DOCUMENT);
    for (const part of ["Gegenstand", "Art und Zweck", "Kategorien personenbezogener Daten", "betroffener Personen", "Pflichten", "TOM", "Unterauftragsverarbeiter", "Hetzner", "Scaleway", "Löschung"]) {
      expect(md, part).toContain(part);
    }
  });

  it("Uebergangsfrist beginnt nach der Veroeffentlichung", () => {
    expect(avvGraceUntil() > AVV_DOCUMENT.publishedAt).toBe(true);
  });
});
