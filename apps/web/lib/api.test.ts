import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

type Pending = { signal?: AbortSignal; resolve: (body: unknown) => void };

function stubFetch() {
  const calls: Pending[] = [];
  const fn = vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((res, rej) => {
      const signal = init?.signal ?? undefined;
      signal?.addEventListener("abort", () => rej(new DOMException("Abgebrochen", "AbortError")));
      calls.push({ signal, resolve: (body) => res(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) });
    });
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

afterEach(() => vi.unstubAllGlobals());

describe("api: gleichzeitige GET-Anfragen", () => {
  it("teilen sich eine Anfrage, jeder Aufrufer bekommt die Antwort", async () => {
    const { calls, fn } = stubFetch();
    const a = api<{ n: number }>("/notifications");
    const b = api<{ n: number }>("/notifications");
    expect(fn).toHaveBeenCalledTimes(1);
    calls[0].resolve({ n: 1 });
    expect(await a).toEqual({ n: 1 });
    expect(await b).toEqual({ n: 1 });
  });

  it("danach (nicht mehr gleichzeitig) gibt es eine neue Anfrage, andere Pfade und POST sind getrennt", async () => {
    const { calls, fn } = stubFetch();
    const first = api("/x");
    calls[0].resolve({});
    await first;
    const second = api("/x");
    expect(fn).toHaveBeenCalledTimes(2);
    calls[1].resolve({});
    await second;
    void api("/y");
    void api("/y", { method: "POST", body: {} });
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("Abbruch eines Aufrufers bricht die gemeinsame Anfrage erst ab, wenn keiner mehr wartet", async () => {
    const { calls } = stubFetch();
    const c1 = new AbortController();
    const c2 = new AbortController();
    const a = api("/orgs/sv", { signal: c1.signal });
    const b = api<string>("/orgs/sv", { signal: c2.signal });
    c1.abort();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    expect(calls[0].signal?.aborted).toBe(false);
    calls[0].resolve("ok");
    expect(await b).toBe("ok");

    const c3 = new AbortController();
    const solo = api("/orgs/other", { signal: c3.signal });
    c3.abort();
    await expect(solo).rejects.toMatchObject({ name: "AbortError" });
    expect(calls[1].signal?.aborted).toBe(true);
  });
});
