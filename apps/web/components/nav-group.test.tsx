import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Home } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/verwaltung/mitglieder", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null, loading: true, logout: vi.fn() }) }));

import { NavGroup } from "./app-shell";

afterEach(cleanup);

const items = [
  { href: "/verwaltung/uebersicht", label: "Übersicht", icon: Home },
  { href: "/verwaltung/mitglieder", label: "Mitglieder", icon: Home },
];
const group = (active: boolean) => <NavGroup id="verwaltung" href="/verwaltung" label="Verwaltung" icon={Home} active={active} currentHref="/verwaltung/mitglieder" items={items} />;

describe("NavGroup (Seitenleiste)", () => {
  it("ist im Bereich offen und der Pfeil klappt zu und wieder auf (aria-expanded)", () => {
    render(group(true));
    const toggle = screen.getByRole("button", { name: "Verwaltung einklappen" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Mitglieder" })).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByRole("link", { name: "Mitglieder" })).toBeNull();
    const closed = screen.getByRole("button", { name: "Verwaltung aufklappen" });
    expect(closed.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(closed);
    expect(screen.getByRole("link", { name: "Mitglieder" })).toBeTruthy();
  });

  it("ausserhalb des Bereichs zu, per Pfeil auf; Verlassen des Bereichs setzt auf automatisch zurueck", () => {
    const { rerender } = render(group(false));
    expect(screen.queryByRole("link", { name: "Mitglieder" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Verwaltung aufklappen" }));
    expect(screen.getByRole("link", { name: "Mitglieder" })).toBeTruthy();
    rerender(group(true));
    expect(screen.getByRole("link", { name: "Mitglieder" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verwaltung einklappen" }));
    rerender(group(false));
    expect(screen.queryByRole("link", { name: "Mitglieder" })).toBeNull();
  });

  it("Klick auf die aktuelle Zeile klappt zu, statt neu zu navigieren", () => {
    render(<NavGroup id="verwaltung" href="/verwaltung/mitglieder" label="Verwaltung" icon={Home} active currentHref="/verwaltung/mitglieder" items={items} />);
    fireEvent.click(screen.getByRole("link", { name: "Verwaltung" }));
    expect(screen.queryByRole("link", { name: "Übersicht" })).toBeNull();
  });
});
