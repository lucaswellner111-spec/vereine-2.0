import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { useInfiniteScroll, useMoreFailed } from "./use-infinite-scroll";

/** IntersectionObserver-Attrappe: Tests loesen Sichtbarkeit von Hand aus. */
class FakeIO {
  static all: FakeIO[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(public cb: IntersectionObserverCallback, public opts?: IntersectionObserverInit) {
    FakeIO.all.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {
    this.disconnected = true;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
  fire(visible: boolean) {
    this.cb(this.observed.map((target) => ({ isIntersecting: visible, target }) as IntersectionObserverEntry), this as unknown as IntersectionObserver);
  }
}
const active = () => FakeIO.all.filter((o) => !o.disconnected);

function List({ hasMore, loading, onLoadMore }: { hasMore: boolean; loading: boolean; onLoadMore: () => void }) {
  const ref = useInfiniteScroll({ hasMore, loading, onLoadMore });
  return <div ref={ref} data-testid="sentinel" />;
}

beforeEach(() => {
  FakeIO.all = [];
  vi.stubGlobal("IntersectionObserver", FakeIO);
});
afterEach(() => vi.unstubAllGlobals());

describe("useInfiniteScroll", () => {
  it("laedt bei Sichtbarkeit mit 600px Vorlauf, nicht wenn unsichtbar", () => {
    const load = vi.fn();
    render(<List hasMore loading={false} onLoadMore={load} />);
    expect(active()).toHaveLength(1);
    expect(active()[0].opts?.rootMargin).toBe("600px");
    act(() => active()[0].fire(false));
    expect(load).not.toHaveBeenCalled();
    act(() => active()[0].fire(true));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("laedt nicht waehrend loading oder ohne hasMore und beobachtet danach neu", () => {
    const load = vi.fn();
    const { rerender } = render(<List hasMore loading onLoadMore={load} />);
    expect(active()).toHaveLength(0); // waehrend des Ladens nicht beobachten
    rerender(<List hasMore={false} loading={false} onLoadMore={load} />);
    expect(active()).toHaveLength(0);
    rerender(<List hasMore loading={false} onLoadMore={load} />);
    expect(active()).toHaveLength(1);
    act(() => active()[0].fire(true));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("fehlgeschlagenes Nachladen sperrt den Sentinel bis Klick oder online (keine Schleife)", async () => {
    const load = vi.fn().mockRejectedValue(new Error("offline"));
    function Failing() {
      const [failed, setFailed] = useMoreFailed();
      const [busy, setBusy] = useState(false);
      const more = () => {
        setBusy(true);
        load()
          .catch(() => setFailed(true))
          .finally(() => setBusy(false));
      };
      const ref = useInfiniteScroll({ hasMore: !failed, loading: busy, onLoadMore: more });
      return (
        <>
          <div ref={ref} />
          <button type="button" onClick={() => { setFailed(false); more(); }}>Mehr laden</button>
        </>
      );
    }
    const { getByText } = render(<Failing />);
    await act(async () => active()[0].fire(true));
    expect(load).toHaveBeenCalledTimes(1);
    expect(active()).toHaveLength(0); // gesperrt, obwohl der Sentinel sichtbar bleibt
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(active()).toHaveLength(1);
    await act(async () => active()[0].fire(true));
    expect(load).toHaveBeenCalledTimes(2);
    expect(active()).toHaveLength(0);
    await act(async () => getByText("Mehr laden").click());
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("ohne IntersectionObserver passiert nichts (Rueckfall ist der Knopf)", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const load = vi.fn();
    render(<List hasMore loading={false} onLoadMore={load} />);
    expect(load).not.toHaveBeenCalled();
  });
});
