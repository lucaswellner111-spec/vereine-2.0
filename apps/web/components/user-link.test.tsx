import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { profileHref, UserAvatarLink, UserNameLink } from "./ui";

afterEach(cleanup);

describe("Profil-Links (UserAvatarLink, UserNameLink)", () => {
  it("profileHref: Handle wird kodiert, ohne Handle kein Ziel", () => {
    expect(profileHref("anna_b")).toBe("/profil/anna_b");
    expect(profileHref(null)).toBeNull();
    expect(profileHref(undefined)).toBeNull();
    expect(profileHref("")).toBeNull();
  });

  it("Name mit Handle ist ein Link zum Profil", () => {
    render(<UserNameLink handle="anna_b" name="Anna B." className="font-medium" />);
    const link = screen.getByRole("link", { name: "Anna B." });
    expect(link.getAttribute("href")).toBe("/profil/anna_b");
    expect(link.className).toContain("hit-area");
    expect(link.className).toContain("font-medium");
  });

  it("Name ohne Handle ist nur Text", () => {
    render(<UserNameLink handle={null} name="Gelöschter Nutzer" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Gelöschter Nutzer").tagName).toBe("SPAN");
  });

  it("Avatar mit Handle: eigener Link mit Namen", () => {
    render(<UserAvatarLink handle="anna_b" name="Anna B." />);
    const link = screen.getByRole("link", { name: "Profil von Anna B." });
    expect(link.getAttribute("href")).toBe("/profil/anna_b");
    expect(link.getAttribute("tabindex")).toBeNull();
  });

  it("Avatar neben dem Namen (decorative): kein zweiter Tab-Stopp, fuer Screenreader verborgen", () => {
    const { container } = render(
      <div>
        <UserAvatarLink handle="anna_b" name="Anna B." decorative />
        <UserNameLink handle="anna_b" name="Anna B." />
      </div>,
    );
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("tabindex")).toBe("-1");
    expect(links[0].getAttribute("aria-hidden")).toBe("true");
    // Fuer Hilfsmittel bleibt genau ein Link
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("Avatar ohne Handle ist kein Link", () => {
    const { container } = render(<UserAvatarLink handle={null} name="Anna B." />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("AB");
  });
});

/**
 * Jede Avatar-Nutzung mit Personenbezug geht ueber UserAvatarLink oder steht bewusst in dieser Liste
 * (eigener Avatar, Vereinslogo, Zeile ist schon Link/Knopf/Label – keine verschachtelten Links).
 */
describe("Avatar-Stellen", () => {
  const ALLOWED: Record<string, string> = {
    "app/(app)/chat/page.tsx": "Chatliste: Zeile ist ein Knopf",
    "app/(app)/einstellungen/page.tsx": "eigener Avatar",
    "app/(app)/einstellungen/profil/page.tsx": "eigenes Profil; Folgeanfragen-Zeile ist bereits ein Profil-Link",
    "app/(app)/feed/page.tsx": "eigener Avatar im Composer",
    "app/(app)/kalender/[id]/page.tsx": "Zusagen: Avatar und Name gemeinsam in einem Profil-Link",
    "app/(app)/personen/page.tsx": "Zeile ist bereits ein Profil-Link",
    "app/(app)/profil/[handle]/page.tsx": "Profilkopf selbst; Follower-Zeilen sind Profil-Links",
    "components/app-shell.tsx": "eigener Avatar (Menue)",
    "components/mobile-more-sheet.tsx": "eigener Avatar",
    "components/chat/add-members-dialog.tsx": "Zeile ist ein Checkbox-Label",
    "components/chat/new-chat.tsx": "Zeile ist ein Knopf",
    "components/chat/thread.tsx": "Gruppenkopf ohne Person (Direktchat nutzt UserAvatarLink)",
    "components/post-card.tsx": "Vereinslogo",
    "components/ui.tsx": "Definition",
  };
  const root = join(__dirname, "..");
  const files = (dir: string): string[] =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : files(p);
      return e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx") ? [p] : [];
    });

  it("keine neue Avatar-Stelle ohne Profil-Link", () => {
    const all = [...files("app"), ...files("components")];
    expect(all).toContain("components/post-card.tsx");
    const offenders = all.filter((f) => {
      const src = readFileSync(join(root, f), "utf8");
      const plain = [...src.matchAll(/<Avatar\b[^>]*>/g)].filter((m) => !/kind="org"/.test(m[0]));
      return plain.length > 0 && !(f in ALLOWED);
    });
    expect(offenders).toEqual([]);
  });
});
