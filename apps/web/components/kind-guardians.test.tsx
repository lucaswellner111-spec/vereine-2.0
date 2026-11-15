import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { YouthGuardiansView } from "@vereine/shared";
import { UiHosts } from "./ui-hosts";

import { KindGuardians } from "./kind-guardians";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const one: YouthGuardiansView = {
  guardians: [{ userId: "g1", name: "Pia E.", isMe: true, isBillingContact: true, since: "2026-11-01T10:00:00.000Z" }],
  invites: [],
  canInvite: true,
};
const two: YouthGuardiansView = {
  guardians: [
    { userId: "g1", name: "Pia E.", isMe: true, isBillingContact: true, since: "2026-11-01T10:00:00.000Z" },
    { userId: "g2", name: "Pam E.", isMe: false, isBillingContact: false, since: "2026-11-05T10:00:00.000Z" },
  ],
  invites: [],
  canInvite: false,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("KindGuardians", () => {
  it("laedt den zweiten Elternteil per Mail ein (Adresse im Body, Hinweis auf eigene Konten)", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "POST" ? new Response(null, { status: 204 }) : json(one)));
    vi.stubGlobal("fetch", fetchMock);
    render(<KindGuardians childId="k1" childName="Lena K." paused={false} onChanged={() => undefined} />);
    expect(await screen.findByText("Pia E. (du)")).toBeTruthy();
    expect(screen.getByText("Rechnungsempfänger")).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Einladung schicken" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Zweiten Elternteil einladen"), { target: { value: "pam@example.de" } });
    fireEvent.click(submit);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === "POST")).toBe(true));
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST")!;
    expect(String(post[0])).toContain("/guardian/children/k1/guardians");
    expect(JSON.parse(String(post[1]!.body))).toEqual({ email: "pam@example.de" });
  });

  it("zeigt bei zwei Eltern keinen Einladungs-Dialog und wechselt nach Rueckfrage den Rechnungsempfaenger", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "PUT" ? new Response(null, { status: 204 }) : json(two)));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <>
        <KindGuardians childId="k1" childName="Lena K." paused={false} onChanged={() => undefined} />
        <UiHosts />
      </>,
    );
    expect(await screen.findByText("Pam E.")).toBeTruthy();
    expect(screen.queryByLabelText("Zweiten Elternteil einladen")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Rechnungen dorthin" }));
    fireEvent.click(await screen.findByRole("button", { name: "Wechseln" }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === "PUT")).toBe(true));
    const put = fetchMock.mock.calls.find((c) => c[1]?.method === "PUT")!;
    expect(String(put[0])).toContain("/guardian/children/k1/billing-contact");
    expect(JSON.parse(String(put[1]!.body))).toEqual({ guardianId: "g2" });
  });

  it("bei ruhendem Jugendkonto kein Wechsel des Rechnungsempfaengers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(two)));
    render(<KindGuardians childId="k1" childName="Lena K." paused onChanged={() => undefined} />);
    await screen.findByText("Pam E.");
    expect(screen.queryByRole("button", { name: "Rechnungen dorthin" })).toBeNull();
  });
});
