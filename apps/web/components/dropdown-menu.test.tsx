import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, DropdownMenu, type MenuEntry } from "./ui-client";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function entries(onSelect: (id: string) => void = () => undefined): MenuEntry[] {
  return [
    { id: "a", label: "Alpha", onSelect: () => onSelect("a") },
    { id: "b", label: "Beta", onSelect: () => onSelect("b"), disabled: true },
    { type: "separator", id: "sep" },
    {
      type: "group",
      id: "g",
      label: "Gruppe",
      items: [
        { id: "c", label: "Gamma", onSelect: () => onSelect("c") },
        { id: "d", label: "Delta", onSelect: () => onSelect("d"), danger: true },
      ],
    },
  ];
}

const trigger = () => screen.getByRole("button", { name: "Optionen" });
const item = (name: string) => screen.getByRole("menuitem", { name });

describe("DropdownMenu", () => {
  it("Rollen, aria-expanded, Klick oeffnet und fokussiert das erste aktive Item", async () => {
    const user = userEvent.setup();
    render(<DropdownMenu label="Optionen" items={entries()} />);
    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(trigger());
    const menu = screen.getByRole("menu", { name: "Optionen" });
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(trigger().getAttribute("aria-controls")).toBe(menu.id);
    expect(document.activeElement).toBe(item("Alpha"));
    expect(item("Beta").getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("group", { name: "Gruppe" })).toBeTruthy();
    expect(screen.getByRole("separator")).toBeTruthy();
    for (const el of screen.getAllByRole("menuitem")) expect(el.tabIndex).toBe(-1);
  });

  it("Pfeile mit Umlauf, disabled uebersprungen, Home/End", async () => {
    const user = userEvent.setup();
    render(<DropdownMenu label="Optionen" items={entries()} />);
    await user.click(trigger());
    await user.keyboard("{ArrowDown}"); // Beta deaktiviert
    expect(document.activeElement).toBe(item("Gamma"));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(item("Delta"));
    await user.keyboard("{ArrowDown}"); // Umlauf
    expect(document.activeElement).toBe(item("Alpha"));
    await user.keyboard("{ArrowUp}"); // Umlauf rueckwaerts
    expect(document.activeElement).toBe(item("Delta"));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(item("Alpha"));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(item("Delta"));
  });

  it("Trigger: ArrowDown oeffnet am ersten, ArrowUp am letzten Item, Enter oeffnet", async () => {
    const user = userEvent.setup();
    render(<DropdownMenu label="Optionen" items={entries()} />);
    trigger().focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(item("Alpha"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());

    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(item("Delta"));
    await user.keyboard("{Escape}");

    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(document.activeElement).toBe(item("Alpha"));
  });

  it("Enter auf Item: onSelect genau einmal, Menue weg, Fokus waehrend onSelect auf dem Trigger", async () => {
    const user = userEvent.setup();
    let focusedDuringSelect: Element | null = null;
    const onSelect = vi.fn(() => {
      focusedDuringSelect = document.activeElement;
    });
    render(<DropdownMenu label="Optionen" items={entries(onSelect)} />);
    await user.click(trigger());
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("c");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(focusedDuringSelect).toBe(trigger());
    expect(document.activeElement).toBe(trigger());
  });

  it("Klick auf deaktiviertes Item tut nichts", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<DropdownMenu label="Optionen" items={entries(onSelect)} />);
    await user.click(trigger());
    await user.click(item("Beta"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("Escape und Tab schliessen und geben den Fokus an den Trigger", async () => {
    const user = userEvent.setup();
    render(
      <>
        <DropdownMenu label="Optionen" items={entries()} />
        <button>Danach</button>
      </>,
    );
    await user.click(trigger());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());

    await user.click(trigger());
    await user.tab();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());

    await user.click(trigger());
    await user.tab({ shift: true });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("Klick ausserhalb schliesst ohne onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <>
        <DropdownMenu label="Optionen" items={entries(onSelect)} onOpenChange={onOpenChange} />
        <p>Irgendwo</p>
      </>,
    );
    await user.click(trigger());
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByText("Irgendwo"));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("Klick auf den Trigger schliesst ein offenes Menue wieder", async () => {
    const user = userEvent.setup();
    render(<DropdownMenu label="Optionen" items={entries()} />);
    await user.click(trigger());
    await user.click(trigger());
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Leere Items: nichts gerendert", () => {
    const { container } = render(<DropdownMenu label="Optionen" items={[]} />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("Eigener Trigger bekommt die Props", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        label="Optionen"
        items={entries()}
        trigger={(p) => (
          <button {...p}>
            Mehr
          </button>
        )}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Optionen" }));
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("Resize schliesst das Menue", async () => {
    const user = userEvent.setup();
    render(<DropdownMenu label="Optionen" items={entries()} />);
    await user.click(trigger());
    fireEvent(window, new Event("resize"));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

function MenuInDialog({ onSelect }: { onSelect: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Foto">
      <p>Text im Dialog</p>
      <DropdownMenu label="Optionen" items={[{ id: "x", label: "Melden", onSelect }]} />
    </Dialog>
  );
}

describe("DropdownMenu im Dialog", () => {
  it("Escape schliesst erst nur das Menue, das zweite Escape den Dialog", async () => {
    const user = userEvent.setup();
    render(<MenuInDialog onSelect={() => undefined} />);
    await user.click(trigger());
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Foto" })).toBeTruthy();
    expect(document.activeElement).toBe(trigger());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape bei Fokus auf body schliesst nur das Menue", async () => {
    const user = userEvent.setup();
    render(<MenuInDialog onSelect={() => undefined} />);
    await user.click(trigger());
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Foto" })).toBeTruthy();
  });

  it("Klick auf ein Item im Portal schliesst den Dialog nicht; Tab bleibt im Menue-Ablauf", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MenuInDialog onSelect={onSelect} />);
    await user.click(trigger());
    await user.click(item("Melden"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Foto" })).toBeTruthy();

    await user.click(trigger());
    await user.tab();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(screen.getByRole("dialog", { name: "Foto" })).toBeTruthy();
  });
});
