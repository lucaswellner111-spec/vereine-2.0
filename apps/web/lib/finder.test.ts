import { describe, expect, it } from "vitest";
import { tagHref } from "@/components/tag-chips";
import { finderLink, finderQuery } from "./finder";

describe("Vereinsfinder", () => {
  it("uebersetzt URL-Parameter in die Abfrage der oeffentlichen API und verwirft ungueltige Werte", () => {
    expect(finderQuery({}).apiQuery).toBe("");
    const f = finderQuery({ q: " Turn ", ort: "Musterstadt", tag: "fussball", kategorie: "Sport", seite: "3" });
    expect(f).toMatchObject({ q: "Turn", ort: "Musterstadt", tag: "fussball", kategorie: "Sport", seite: 3 });
    expect(f.apiQuery).toBe("q=Turn&city=Musterstadt&tag=fussball&category=Sport&offset=60");
    expect(finderQuery({ tag: "gibt-es-nicht", kategorie: "Quatsch", seite: "-2" })).toMatchObject({ tag: "", kategorie: "", seite: 1, apiQuery: "" });
    expect(finderQuery({ q: ["a", "b"] }).q).toBe("a");
  });

  it("Seitenlinks behalten die Filter", () => {
    expect(finderLink({ q: "", ort: "Bad Soden", tag: "", kategorie: "" }, 2)).toBe("/vereine-finden?ort=Bad+Soden&seite=2");
    expect(finderLink({ q: "", ort: "", tag: "", kategorie: "" }, 1)).toBe("/vereine-finden");
  });

  it("Tag-Links: App -> /tags/<id>, oeffentlich -> Finder", () => {
    expect(tagHref("/tags", "fussball")).toBe("/tags/fussball");
    expect(tagHref("/vereine-finden", "fussball")).toBe("/vereine-finden?tag=fussball");
  });
});
