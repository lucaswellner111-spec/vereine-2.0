import { cleanup, render } from "@testing-library/react";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteFooter } from "@/components/site";
import { HELP_LINKS, LEGAL_LINKS } from "@/lib/legal-links";

const FULL_ENV: Record<string, string> = {
  NEXT_PUBLIC_LEGAL_COMPANY: "Beispiel Klubnest UG",
  NEXT_PUBLIC_LEGAL_FORM: "UG (haftungsbeschränkt)",
  NEXT_PUBLIC_LEGAL_STREET: "Musterstraße 1",
  NEXT_PUBLIC_LEGAL_POSTAL_CITY: "04109 Leipzig",
  NEXT_PUBLIC_LEGAL_REPRESENTATIVES: "Erika Muster (Geschäftsführerin)",
  NEXT_PUBLIC_LEGAL_REGISTER: "Amtsgericht Leipzig, HRB 00000",
  NEXT_PUBLIC_LEGAL_VAT_ID: "DE000000000",
  NEXT_PUBLIC_LEGAL_EMAIL: "kontakt@example.test",
  NEXT_PUBLIC_LEGAL_PHONE: "-",
  NEXT_PUBLIC_LEGAL_DPO: "Datenschutzkontakt, datenschutz@example.test",
  NEXT_PUBLIC_LEGAL_DSA_EMAIL: "dsa@example.test",
  NEXT_PUBLIC_LEGAL_AUTHORITY: "Sächsische Datenschutz- und Transparenzbeauftragte",
};

const PAGES = [...LEGAL_LINKS, ...HELP_LINKS];
const ROUTE_DIR = join(__dirname);

/** Seite nach Pfad laden (frisches Modul, damit legal-config die gesetzten Werte liest). */
async function loadPage(href: string) {
  vi.resetModules();
  const mod = (await import(/* @vite-ignore */ `.${href}/page.tsx`)) as { default: () => React.JSX.Element };
  return mod.default;
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("Rechts- und Hilfeseiten", () => {
  it.each(PAGES)("$href rendert mit Überschrift, Inhaltsverzeichnis und Abschnitten", async ({ href }) => {
    const Page = await loadPage(href);
    const { container } = render(<Page />);
    expect(container.querySelector("h1")?.textContent).toBeTruthy();
    const toc = container.querySelector("nav[aria-labelledby='toc-title']");
    expect(toc).not.toBeNull();
    const anchors = [...(toc?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href")!.slice(1));
    expect(anchors.length).toBeGreaterThanOrEqual(4);
    for (const id of anchors) expect(container.querySelector(`section#${id}`), `Abschnitt ${id}`).not.toBeNull();
    // keine Behauptung "geprüft"/"DSGVO-konform" und kein altes Platzhalter-Banner
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/anwaltlich geprüft|DSGVO-konform|nicht geprüft|muss vor dem Start von einer Rechtsberatung/i);
  });

  it.each(PAGES)("$href: mit allen Firmendaten bleibt kein Platzhalter-Marker übrig", async ({ href }) => {
    for (const [k, v] of Object.entries(FULL_ENV)) vi.stubEnv(k, v);
    const Page = await loadPage(href);
    const { container } = render(<Page />);
    expect(container.textContent).not.toContain("[…");
  });

  it("Impressum zeigt ohne Konfiguration sichtbare Platzhalter, mit Konfiguration die Firmendaten", async () => {
    let Page = await loadPage("/impressum");
    let view = render(<Page />);
    expect(view.container.textContent).toContain("[… Firmenname …]");
    view.unmount();
    for (const [k, v] of Object.entries(FULL_ENV)) vi.stubEnv(k, v);
    Page = await loadPage("/impressum");
    view = render(<Page />);
    const text = view.container.textContent ?? "";
    expect(text).toContain("Beispiel Klubnest UG");
    expect(text).toContain("Amtsgericht Leipzig, HRB 00000");
    expect(text).toContain("DE000000000");
    expect(text).not.toContain("Telefon");
  });

  it("Datenschutzerklärung nennt die tatsächlichen Empfänger und keine Drittanbieter-Dienste", async () => {
    const Page = await loadPage("/datenschutz");
    const { container } = render(<Page />);
    const text = container.textContent ?? "";
    for (const part of ["Hetzner", "Scaleway", "Push", "keine Ende-zu-Ende-Verschlüsselung", "Art. 6 Abs. 1 lit. f", "Beschwerde", "Server-Protokolle", "§ 25 Abs. 2 Nr. 2 TDDDG", "Warteliste"]) {
      expect(text, part).toContain(part);
    }
    expect(text).not.toMatch(/Google Analytics|Facebook Pixel|Cloudflare/);
  });

  it("Nutzungsbedingungen erwähnen weder Spenden noch Zahlungsabwicklung", async () => {
    const Page = await loadPage("/agb");
    const { container } = render(<Page />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Spende|Zahlungsdienst|Zahlungsabwicklung/i);
    expect(text).toContain("Rechnungen als PDF");
  });

  it("Fußzeile verlinkt alle Rechts- und Hilfeseiten, und jede Seite existiert", () => {
    const { container } = render(<SiteFooter />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    for (const p of PAGES) expect(hrefs, p.href).toContain(p.href);
    for (const p of PAGES) expect(existsSync(join(ROUTE_DIR, p.href, "page.tsx")), `Seite ${p.href}`).toBe(true);
  });

  it("interne Links der Seiten zeigen auf vorhandene Routen", async () => {
    const known = new Set(["/", "/registrieren", "/login", "/vereine-finden", "/warteliste"]);
    for (const p of PAGES) known.add(p.href);
    for (const p of PAGES) {
      const Page = await loadPage(p.href);
      const { container, unmount } = render(<Page />);
      for (const a of container.querySelectorAll("a[href^='/']")) {
        const href = a.getAttribute("href")!.split("#")[0];
        if (href.startsWith("/api/")) continue;
        expect(known.has(href), `${p.href} verlinkt ${href}`).toBe(true);
      }
      unmount();
    }
  });
});
