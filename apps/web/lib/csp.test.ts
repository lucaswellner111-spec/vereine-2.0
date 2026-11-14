import { describe, expect, it } from "vitest";
import { buildCsp, newNonce } from "./csp";

describe("CSP mit Nonce", () => {
  const csp = buildCsp("abc123");
  const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

  it("Skripte nur mit Nonce, kein unsafe-inline/unsafe-eval", () => {
    expect(directive("script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(directive("script-src")).not.toMatch(/unsafe-inline/);
    expect(directive("style-src")).not.toMatch(/unsafe-inline/);
  });

  it("nur eigene Quellen: keine Fremd-Hosts, Chat per wss:", () => {
    expect(csp).not.toMatch(/https?:\/\//);
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("connect-src")).toBe("connect-src 'self' wss:");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("object-src")).toBe("object-src 'none'");
  });

  it("Nonce ist base64, zufaellig und gueltig fuer die CSP-Syntax", () => {
    const a = newNonce();
    const b = newNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
