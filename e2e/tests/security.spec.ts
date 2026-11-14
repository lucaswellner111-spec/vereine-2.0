import { createOrgApi, expect, signupApi, test } from "./fixtures";

/** Verstoesse gegen die CSP im Browser sammeln (securitypolicyviolation). */
async function collectCspViolations(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

test("CSP mit Nonce: Skripte nur mit Nonce, keine Verstoesse auf Startseite, Anmeldung und App", async ({ page }, info) => {
  const violations = await collectCspViolations(page);
  const res = await page.goto("/");
  const csp = res?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  expect(csp).not.toMatch(/style-src 'self'[^;]*unsafe-inline/);
  // Der Nonce wechselt mit jeder Anfrage
  const again = await page.goto("/");
  expect(again?.headers()["content-security-policy"]).not.toBe(csp);

  await page.goto("/login");
  await expect(page.getByRole("button", { name: /anmelden/i }).first()).toBeVisible();
  await signupApi(page.request, "Cora", info);
  await createOrgApi(page.request, `SV Csp ${info.workerIndex}`);
  await page.goto("/feed");
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).first()).toBeVisible();
  expect(await violations()).toEqual([]);
});

test("Bot-Abwehr ist in der E2E-Umgebung aus: Config meldet enabled=false, Formulare laufen ohne Loesung", async ({ page }) => {
  const res = await page.request.get("/api/captcha/config");
  expect(await res.json()).toEqual({ enabled: false });
  const challenge = await page.request.get("/api/captcha/challenge");
  expect((await challenge.json()).algorithm).toBe("SHA-256");
});
