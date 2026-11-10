import { describe, expect, it } from "vitest";
import { postHref, postMenuIds } from "./post-card";

describe("Beitragsmenue", () => {
  it("Bearbeiten nur mit canEdit, Löschen nur mit canDelete, Teilen immer", () => {
    expect(postMenuIds({ canEdit: false, canDelete: false }, false)).toEqual(["share", "less", "report"]);
    expect(postMenuIds({ canEdit: true, canDelete: true }, true)).toEqual(["why", "edit", "share", "less", "report", "delete"]);
    expect(postMenuIds({ canEdit: false, canDelete: true }, false)).not.toContain("edit");
  });

  it("Als Story teilen nur bei Vereinsbeiträgen", () => {
    expect(postMenuIds({ canEdit: false, canDelete: false, org: { slug: "tsv", name: "TSV", logoId: null } }, false)).toEqual(["share", "story", "less", "report"]);
    expect(postMenuIds({ canEdit: false, canDelete: false, org: null }, false)).not.toContain("story");
  });

  it("Teilen-Link zeigt auf die Beitragsseite", () => {
    expect(postHref("abc")).toBe("/beitrag/abc");
  });
});
