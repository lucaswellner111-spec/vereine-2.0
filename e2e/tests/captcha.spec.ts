import { createHash } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, lastMailApi, PASSWORD, test, tokenFromMail, unique } from "./fixtures";

/**
 * Bot-Abwehr (Proof-of-Work) im echten Produktions-Build mit eingeschaltetem Zwang. Laeuft nur, wenn der Server mit
 * CAPTCHA_ENFORCE=true gestartet wird (Produktion: Standard):
 *   CAPTCHA_ENFORCE=true npx playwright test -c e2e/playwright.config.ts tests/captcha.spec.ts
 * (Der Test "Bot-Abwehr ist in der E2E-Umgebung aus" in security.spec.ts gilt nur ohne diese Variable.)
 * Die Formulare muessen ohne sichtbare Stoerung gelingen: kein Rueckfrage-Dialog, keine Fehlermeldung.
 */
test.skip(process.env.CAPTCHA_ENFORCE !== "true", "nur mit CAPTCHA_ENFORCE=true");

/** Loest die Aufgabe wie der Browser (Hilfsfunktion fuer Vorbedingungen ueber die API). */
async function solveHeader(request: APIRequestContext): Promise<string> {
  const c = await (await request.get("/api/captcha/challenge")).json();
  for (let n = 0; n <= c.maxnumber; n++) {
    if (createHash("sha256").update(`${c.salt}${n}`).digest("hex") === c.challenge) {
      return Buffer.from(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, salt: c.salt, signature: c.signature, number: n })).toString("base64");
    }
  }
  throw new Error("Aufgabe nicht loesbar");
}

/** Es darf keine Fehlermeldung des Formulars erscheinen. */
async function noAlert(page: Page) {
  await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
}

test("Config meldet enabled=true, ohne Loesung lehnt der Server ab", async ({ page }) => {
  expect(await (await page.request.get("/api/captcha/config")).json()).toEqual({ enabled: true });
  const res = await page.request.post("/api/auth/password/forgot", { data: { email: "niemand@example.de" } });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("Registrieren gelingt unsichtbar", async ({ page }, info) => {
  const email = `${unique("cap", info)}@example.de`;
  await page.goto("/registrieren");
  await page.getByLabel("Anzeigename").fill("Captcha Carla");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByLabel("Ich bin mindestens 16 Jahre alt.").check();
  await page.getByLabel(/Ich akzeptiere die/).check();
  await page.getByLabel(/Ich habe die/).check();
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await expect(page.getByRole("heading", { name: "Prüfe dein Postfach" })).toBeVisible();
  await lastMailApi(page.request, email, "verify-email");
});

test("Passwort vergessen gelingt unsichtbar", async ({ page }, info) => {
  const email = `${unique("capf", info)}@example.de`;
  await page.goto("/passwort-vergessen");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByRole("button", { name: "Link anfordern" }).click();
  await expect(page.getByRole("heading", { name: "Prüfe dein Postfach" })).toBeVisible();
});

test("Warteliste gelingt unsichtbar", async ({ page }, info) => {
  const email = `${unique("capw", info)}@example.de`;
  await page.goto("/warteliste");
  const form = page.getByRole("form", { name: "Warteliste" });
  await form.getByLabel("E-Mail", { exact: true }).fill(email);
  await form.getByRole("checkbox").check();
  await page.waitForTimeout(2500); // Mindestzeit der Warteliste
  await form.getByRole("button", { name: "Auf die Warteliste" }).click();
  await expect(page.getByRole("status").getByText(/Fast geschafft/)).toBeVisible();
  await noAlert(page);
});

test("Mitgliedsantrag gelingt unsichtbar", async ({ page, newContext }, info) => {
  // Vorbedingung: Verein anlegen (Konto per API, mit geloester Aufgabe)
  const owner = await newContext();
  const signup = async (request: APIRequestContext, name: string) => {
    const email = `${unique(name.toLowerCase().replace(/\s/g, ""), info)}@example.de`;
    const reg = await request.post("/api/auth/register", {
      headers: { "x-captcha": await solveHeader(request) },
      data: { email, password: PASSWORD, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    expect(reg.status(), await reg.text()).toBe(202);
    const mail = await lastMailApi(request, email, "verify-email");
    expect((await request.post("/api/auth/email/confirm", { data: { token: tokenFromMail(mail.text) } })).status()).toBe(200);
  };
  await signup(owner.request, "Vorstand Cap");
  const created = await owner.request.post("/api/orgs", { data: { name: `SV Captcha ${unique("o", info)}`, category: "Sport", city: "Teststadt" } });
  expect(created.status()).toBe(201);
  const slug = (await created.json()).slug as string;

  await signup(page.request, "Mitglied Cap");
  await page.goto(`/vereine/${slug}`);
  await page.getByRole("button", { name: "Mitglied werden" }).click();
  await expect(page.getByRole("button", { name: /Antrag zurückziehen|zurückziehen/i })).toBeVisible();
  await noAlert(page);
});
