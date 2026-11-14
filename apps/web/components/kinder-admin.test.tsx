import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { YouthChild } from "@vereine/shared";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push }) }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "u1", displayName: "Pia", email: "p@x.de", createdAt: "", emailVerified: true } }) }));

import { KinderAdmin } from "./kinder-admin";

const child: YouthChild = { id: "k1", name: "Lena K.", fullName: "Lena Kowalski", birthDate: "2015-03-02", age: 11, graduationDue: "2031-03-02", paused: false, isBillingContact: true, orgs: [{ orgId: "o1", slug: "sv", name: "SV Test", status: "active" }] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
});

describe("KinderAdmin", () => {
  it("erklaert, was gespeichert wird, und listet die Kinder mit Verein", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([child])));
    render(<KinderAdmin />);
    expect(screen.getByText("Was wir über dein Kind speichern")).toBeTruthy();
    expect(await screen.findByText("Lena Kowalski")).toBeTruthy();
    expect(screen.getByText(/11 Jahre · SV Test/)).toBeTruthy();
  });

  it("Kind anlegen braucht die Selbstauskunft und schickt sie mit", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "POST" ? json(child, 201) : json([])));
    vi.stubGlobal("fetch", fetchMock);
    render(<KinderAdmin />);
    await screen.findByText("Noch kein Kind angelegt");
    fireEvent.click(screen.getByRole("button", { name: /Kind hinzufügen/ }));
    fireEvent.change(await screen.findByLabelText("Vorname"), { target: { value: "Lena" } });
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Kowalski" } });
    fireEvent.change(screen.getByLabelText("Geburtsdatum"), { target: { value: "2016-01-01" } });
    const submit = screen.getByRole("button", { name: "Kind anlegen" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/kinder/k1"));
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ firstName: "Lena", lastName: "Kowalski", birthDate: "2016-01-01", confirmGuardian: true });
  });
});
