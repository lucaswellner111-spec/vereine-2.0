import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Bell } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePullToRefresh, PULL_THRESHOLD } from "@/lib/use-pull-to-refresh";
import { ListGroup, ListRow, Toggle } from "./ui";

afterEach(cleanup);

describe("ListGroup/ListRow", () => {
  it("zeigt Ueberschrift, Fussnote und Zeilen als Link, Button und statisch", () => {
    const onClick = vi.fn();
    render(
      <ListGroup title="Konto" footer="Gilt für alle Geräte.">
        <ListRow href="/einstellungen/profil" icon={Bell} title="Profil" subtitle="Name und Bild" />
        <ListRow onClick={onClick} title="Abmelden" danger />
        <ListRow title="Mitteilungen" value={<Toggle checked={false} onChange={() => undefined} label="Mitteilungen an" />} />
      </ListGroup>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Konto" })).toBeTruthy();
    expect(screen.getByText("Gilt für alle Geräte.")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    const link = screen.getByRole("link", { name: /Profil/ });
    expect(link.getAttribute("href")).toBe("/einstellungen/profil");
    // Chevron nur an Link-Zeilen
    expect(link.querySelectorAll("svg")).toHaveLength(2);

    const button = screen.getByRole("button", { name: "Abmelden" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(button.querySelector("svg")).toBeNull();

    expect(screen.getByRole("switch", { name: "Mitteilungen an" })).toBeTruthy();
    // jede Zeile mind. 44 px (min-h-11)
    document.querySelectorAll("[data-row-body]").forEach((el) => expect(el.className).toContain("min-h-11"));
  });
});

function Pull({ onRefresh }: { onRefresh: () => void }) {
  const { pull, refreshing } = usePullToRefresh(onRefresh);
  return <p data-testid="state">{`${Math.round(pull)}|${refreshing}`}</p>;
}

const touch = (type: "touchStart" | "touchMove" | "touchEnd", y: number) =>
  fireEvent[type](window, { touches: type === "touchEnd" ? [] : [{ clientY: y }] });

describe("usePullToRefresh", () => {
  it("laedt nur ueber der Schwelle neu", async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn();
    render(<Pull onRefresh={onRefresh} />);
    // zu kurz gezogen
    touch("touchStart", 0);
    touch("touchMove", 60);
    expect(screen.getByTestId("state").textContent).toBe("30|false");
    touch("touchEnd", 60);
    expect(onRefresh).not.toHaveBeenCalled();
    // ueber die Schwelle (Daempfung 0,5)
    touch("touchStart", 0);
    touch("touchMove", PULL_THRESHOLD * 2 + 10);
    act(() => touch("touchEnd", 0));
    expect(screen.getByTestId("state").textContent).toBe("0|true");
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.getByTestId("state").textContent).toBe("0|false");
    vi.useRealTimers();
  });
});
