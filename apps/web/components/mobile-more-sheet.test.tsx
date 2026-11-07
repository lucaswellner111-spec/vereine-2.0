import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicUser } from "@vereine/shared";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileMoreSheet } from "./mobile-more-sheet";

let pathname = "/feed";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
// next/link ohne Router: einfaches <a>, Klick ohne Navigation
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: { href: string; children: ReactNode; onClick?: () => void }) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
}));

const user = { id: "u1", displayName: "Erika Muster", email: "erika@example.org" } as unknown as PublicUser;

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  pathname = "/feed";
});

function renderSheet(props: Partial<Parameters<typeof MobileMoreSheet>[0]> = {}) {
  const onClose = vi.fn();
  const onLogout = vi.fn();
  const utils = render(
    <MobileMoreSheet open onClose={onClose} user={user} showVerwaltung={false} showPlattform={false} onLogout={onLogout} {...props} />,
  );
  return { ...utils, onClose, onLogout };
}

describe("MobileMoreSheet", () => {
  it("Dialog mit Namen „Mehr“, Kopf mit Name und E-Mail", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog", { name: "Mehr" });
    expect(dialog.textContent).toContain("Erika Muster");
    expect(dialog.textContent).toContain("erika@example.org");
  });

  it("Kopf verlinkt aufs eigene Profil, ohne Handle auf die Profil-Einstellungen", () => {
    const { unmount } = renderSheet({ profileHref: "/profil/erika" });
    expect(screen.getByRole("link", { name: /Mein Profil/ }).getAttribute("href")).toBe("/profil/erika");
    unmount();
    renderSheet();
    expect(screen.getByRole("link", { name: /Mein Profil/ }).getAttribute("href")).toBe("/einstellungen/profil");
  });

  it("Verwaltung und Plattform nur, wenn erlaubt", () => {
    const { unmount } = renderSheet();
    expect(screen.queryByRole("link", { name: "Verwaltung" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Plattform" })).toBeNull();
    expect(screen.getByRole("link", { name: "Personen finden" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Einstellungen" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Rechnungen" })).toBeTruthy();
    unmount();
    renderSheet({ showVerwaltung: true, showPlattform: true });
    expect(screen.getByRole("link", { name: "Verwaltung" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Plattform" })).toBeTruthy();
  });

  it("markiert den aktuellen Bereich", () => {
    pathname = "/einstellungen/profil";
    renderSheet();
    expect(screen.getByRole("link", { name: "Einstellungen" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Rechnungen" }).getAttribute("aria-current")).toBeNull();
  });

  it("Link-Klick schliesst, Abmelden ruft onLogout", async () => {
    const u = userEvent.setup();
    const { onClose, onLogout } = renderSheet();
    await u.click(screen.getByRole("link", { name: "Personen finden" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await u.click(screen.getByRole("button", { name: "Abmelden" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("Escape schliesst", async () => {
    const u = userEvent.setup();
    const { onClose } = renderSheet();
    await u.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("schliesst bei Seitenwechsel", () => {
    const { rerender, onClose, onLogout } = renderSheet();
    expect(onClose).not.toHaveBeenCalled();
    pathname = "/personen";
    rerender(<MobileMoreSheet open onClose={onClose} user={user} showVerwaltung={false} showPlattform={false} onLogout={onLogout} />);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
