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
  "2026-11-14-entwurf-2": "27a0a3d694c1764f1f48ed621f58baf7fc3d3e02c2399ae1d506ed094a2118d8",
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

  it("alte Fassung bleibt abrufbar und die neue hat TOM-Anhang und Unterauftragsverarbeiter-Liste", () => {
    expect(AVV_VERSIONS.map((d) => d.version)).toEqual(["2026-11-13-entwurf-1", "2026-11-14-entwurf-2"]);
    const md = avvToMarkdown(AVV_DOCUMENT);
    for (const part of ["Anhang 1: Technische und organisatorische Maßnahmen", "Anhang 2: Unterauftragsverarbeiter", "Hetzner Online GmbH", "Scaleway SAS", "Art. 28", "Meldung von Datenschutzverletzungen"]) {
      expect(md, part).toContain(part);
    }
    expect(AVV_DOCUMENT.status).toBe("draft");
  });

  it("Uebergangsfrist beginnt nach der Veroeffentlichung", () => {
    expect(avvGraceUntil() > AVV_DOCUMENT.publishedAt).toBe(true);
  });
});
