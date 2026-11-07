import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fieldAria } from "./ui";
import { Dialog, SegmentedControl, useEscapeLayer } from "./ui-client";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function Segments({ mode = "tabs" as "tabs" | "radio" }) {
  const [v, setV] = useState("a");
  return (
    <SegmentedControl
      aria-label="Test"
      mode={mode}
      value={v}
      onChange={setV}
      options={[
        { value: "a", label: "A" },
        { value: "b", label: "B", disabled: true },
        { value: "c", label: "C" },
        { value: "d", label: "D" },
      ]}
    />
  );
}

describe("SegmentedControl", () => {
  it("Tabs: Rollen, roving tabIndex, Pfeile mit Umlauf, disabled uebersprungen, Home/End", async () => {
    const user = userEvent.setup();
    render(<Segments />);
    expect(screen.getByRole("tablist", { name: "Test" })).toBeTruthy();
    const tab = (n: string) => screen.getByRole("tab", { name: n });
    expect(tab("A").getAttribute("aria-selected")).toBe("true");
    expect(tab("A").tabIndex).toBe(0);
    expect(tab("C").tabIndex).toBe(-1);

    tab("A").focus();
    await user.keyboard("{ArrowRight}"); // B ist deaktiviert
    expect(document.activeElement).toBe(tab("C"));
    expect(tab("C").getAttribute("aria-selected")).toBe("true"); // Auswahl folgt Fokus
    expect(tab("C").tabIndex).toBe(0);
    expect(tab("A").tabIndex).toBe(-1);

    await user.keyboard("{ArrowRight}{ArrowRight}"); // D, Umlauf zu A
    expect(document.activeElement).toBe(tab("A"));
    await user.keyboard("{ArrowLeft}"); // Umlauf rueckwaerts zu D
    expect(document.activeElement).toBe(tab("D"));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(tab("A"));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(tab("D"));
    for (const b of screen.getAllByRole("tab")) expect(b.getAttribute("type")).toBe("button");
  });

  it("Radio: radiogroup/radio mit aria-checked", async () => {
    const user = userEvent.setup();
    render(<Segments mode="radio" />);
    expect(screen.getByRole("radiogroup", { name: "Test" })).toBeTruthy();
    const radio = (n: string) => screen.getByRole("radio", { name: n });
    expect(radio("A").getAttribute("aria-checked")).toBe("true");
    expect(radio("A").getAttribute("aria-selected")).toBeNull();
    await user.click(radio("D"));
    expect(radio("D").getAttribute("aria-checked")).toBe("true");
    expect(radio("A").getAttribute("aria-checked")).toBe("false");
  });
});

function Nested() {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  const okRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button onClick={() => setOuter(true)}>Öffnen</button>
      <Dialog open={outer} onClose={() => setOuter(false)} title="Außen">
        <button onClick={() => setInner(true)}>Innen öffnen</button>
        <Dialog
          open={inner}
          onClose={() => setInner(false)}
          title="Innen"
          initialFocusRef={okRef}
          footer={
            <>
              <button>Abbrechen</button>
              <button ref={okRef}>OK</button>
            </>
          }
        />
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("Initialfokus, Tab kreist, Escape schliesst nur den inneren, Fokus zurueck, Scroll-Sperre per Zaehler", async () => {
    const user = userEvent.setup();
    render(<Nested />);
    const opener = screen.getByRole("button", { name: "Öffnen" });
    await user.click(opener);
    const outer = screen.getByRole("dialog", { name: "Außen" });
    expect(outer.getAttribute("aria-modal")).toBe("true");
    // erstes fokussierbares Element im aeusseren Dialog
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Innen öffnen" }));
    expect(document.body.style.overflow).toBe("hidden");

    const innerOpener = screen.getByRole("button", { name: "Innen öffnen" });
    await user.click(innerOpener);
    const ok = screen.getByRole("button", { name: "OK" });
    expect(document.activeElement).toBe(ok); // initialFocusRef

    // Tab kreist: OK -> Schliessen (X, steht im DOM nach dem Footer) -> Abbrechen -> OK ...
    const inner = screen.getByRole("dialog", { name: "Innen" });
    const order: HTMLElement[] = Array.from(inner.querySelectorAll("button"));
    await user.tab();
    expect(document.activeElement).toBe(order[(order.indexOf(ok) + 1) % order.length]);
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(ok);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(order[(order.indexOf(ok) - 1 + order.length) % order.length]);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Innen" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Außen" })).toBeTruthy();
    expect(document.activeElement).toBe(innerOpener);
    expect(document.body.style.overflow).toBe("hidden"); // aeusserer Dialog sperrt noch

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });
});

function Single({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose();
        setOpen(false);
      }}
      title="Einzeln"
    >
      <p>Nur Text</p>
    </Dialog>
  );
}

describe("useEscapeLayer", () => {
  it("Fokus auf body: Escape ruft onClose, Scroll-Sperre danach aufgehoben", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Single onClose={onClose} />);
    expect(document.body.style.overflow).toBe("hidden");
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("zwei verschachtelte Ebenen: Escape auf body schliesst nur die obere", async () => {
    const user = userEvent.setup();
    render(<Nested />);
    await user.click(screen.getByRole("button", { name: "Öffnen" }));
    await user.click(screen.getByRole("button", { name: "Innen öffnen" }));
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Innen" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Außen" })).toBeTruthy();
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("defaultPrevented verhindert das Schliessen", () => {
    const onEscape = vi.fn();
    function Layer() {
      useEscapeLayer(true, onEscape);
      return null;
    }
    render(<Layer />);
    const prevent = (e: KeyboardEvent) => e.preventDefault();
    window.addEventListener("keydown", prevent, { capture: true });
    try {
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(onEscape).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", prevent, { capture: true });
    }
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("inaktive Ebene reagiert nicht", () => {
    const onEscape = vi.fn();
    function Layer() {
      useEscapeLayer(false, onEscape);
      return null;
    }
    render(<Layer />);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onEscape).not.toHaveBeenCalled();
  });
});

describe("fieldAria", () => {
  it("verknuepft Hinweis und Fehler", () => {
    expect(fieldAria("x")).toEqual({ id: "x" });
    expect(fieldAria("x", { hint: "h" })).toEqual({ id: "x", "aria-describedby": "x-hint" });
    expect(fieldAria("x", { hint: "h", error: "e" })).toEqual({
      id: "x",
      "aria-describedby": "x-hint x-error",
      "aria-invalid": "true",
    });
  });
});

describe("Escape-Stapel (zwei Ebenen im selben Render)", () => {
  function Inner({ onEsc }: { onEsc: () => void }) {
    useEscapeLayer(true, onEsc);
    return null;
  }
  function Outer({ open, outer, inner }: { open: boolean; outer: () => void; inner: () => void }) {
    useEscapeLayer(open, outer);
    return open ? <Inner onEsc={inner} /> : null;
  }

  it("schliesst die innere Ebene zuerst, auch wenn beide gleichzeitig aufgehen", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const { rerender } = render(<Outer open={false} outer={outer} inner={inner} />);
    rerender(<Outer open outer={outer} inner={inner} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});

describe("Dialog", () => {
  it("Panel ist immer per Skript fokussierbar (tabIndex -1)", () => {
    render(<Dialog open onClose={() => undefined} title="Test" />);
    expect(screen.getByRole("dialog").getAttribute("tabindex")).toBe("-1");
  });
});
