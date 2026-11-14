import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);
import type { NotificationItem } from "@vereine/shared";
import { ActivityRow, HIDE_SWIPE } from "./activity-row";
import { RichText, splitMentions } from "./rich-text";

const base: NotificationItem = {
  id: "n1",
  type: "new_follower",
  data: {},
  readAt: null,
  createdAt: new Date().toISOString(),
  actors: [{ id: "u1", name: "Anna", handle: "anna", avatarId: null, following: "none" }],
  count: 1,
};

describe("ActivityRow", () => {
  it("zeigt Text, ungelesen-Punkt, Avatar-Link und Folgen-Knopf", () => {
    const onFollow = vi.fn();
    render(<ActivityRow n={base} onFollow={onFollow} onHide={() => undefined} />);
    expect(screen.getByText("Anna folgt dir jetzt.")).toBeTruthy();
    expect(screen.getByText("(ungelesen)")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Profil von Anna" }).getAttribute("href")).toBe("/profil/anna");
    fireEvent.click(screen.getByRole("button", { name: "Folgen" }));
    expect(onFollow).toHaveBeenCalledWith("u1", "anna", "none");
  });

  it("Zustand 'Gefolgt' und Vorschaubild rechts; gelesen ohne Punkt", () => {
    const n = { ...base, readAt: "2026-11-14T00:00:00Z", actors: [{ ...base.actors![0], following: "following" as const }], preview: { mediaId: "m1", text: null } };
    const { container } = render(<ActivityRow n={n} onFollow={() => undefined} />);
    expect(screen.getByRole("button", { name: "Gefolgt" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("(ungelesen)")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/media/m1/thumb");
  });

  it("Wischen nach links blendet aus; kurzes Wischen und Wischen nach rechts nicht; Knopf fuer Tastatur", () => {
    const onHide = vi.fn();
    const { container } = render(<ActivityRow n={base} onHide={onHide} />);
    const row = container.querySelector("[style], .relative.flex") as HTMLElement;
    const swipe = (from: number, to: number) => {
      fireEvent.pointerDown(row, { pointerId: 1, clientX: from, clientY: 5, pointerType: "touch" });
      fireEvent.pointerUp(row, { pointerId: 1, clientX: to, clientY: 5, pointerType: "touch" });
    };
    swipe(200, 200 - HIDE_SWIPE + 10);
    swipe(100, 100 + HIDE_SWIPE + 10);
    expect(onHide).not.toHaveBeenCalled();
    swipe(200, 200 - HIDE_SWIPE - 10);
    expect(onHide).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /^Ausblenden: / }));
    expect(onHide).toHaveBeenCalledTimes(2);
  });
});

describe("Erwaehnungen im Text", () => {
  it("zerlegt @Namen, ignoriert Mailadressen", () => {
    expect(splitMentions("Hi @anna_1, schreib an a@b.de")).toEqual([{ text: "Hi " }, { handle: "anna_1" }, { text: ", schreib an a@b.de" }]);
    expect(splitMentions("kein Name")).toEqual([{ text: "kein Name" }]);
  });
  it("rendert Profil-Links ohne HTML-Einschleusung", () => {
    const { container } = render(
      <p>
        <RichText text={'@ben <b>fett</b> @x'} />
      </p>,
    );
    expect(screen.getByRole("link", { name: "@ben" }).getAttribute("href")).toBe("/profil/ben");
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<b>fett</b>");
  });
});
