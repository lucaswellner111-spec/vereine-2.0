import { expect, expectAccessible, PASSWORD, test, unique } from "./fixtures";

test("Startseite ist erreichbar und barrierearm", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectAccessible(page, "Startseite");
});

test.describe("Dunkel-Modus", () => {
  test.use({ colorScheme: "dark" });

  test("Startseite und Login sind auch dunkel barrierearm", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectAccessible(page, "Startseite (dunkel)");
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
    await expectAccessible(page, "Login (dunkel)");
  });
});

test("Registrieren, Abmelden und wieder Anmelden", async ({ page }, info) => {
  const email = `${unique("reg", info)}@example.de`;

  await page.goto("/registrieren");
  await page.getByLabel("Anzeigename").fill("Erika E2E");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByLabel("Ich bin mindestens 16 Jahre alt.").check();
  await page.getByLabel(/Ich akzeptiere die/).check();
  await page.getByLabel(/Ich habe die/).check();
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await expect(page).toHaveURL(/\/feed/);

  // Abmelden: am Handy unter Einstellungen, am Desktop in der Seitenleiste (jeweils der sichtbare Knopf)
  await page.goto("/einstellungen");
  // Unter Last kann der erste Klick vor der Hydration kommen: Klick wiederholen, bis die Seite wechselt
  await expect(async () => {
    await page.getByRole("button", { name: "Abmelden" }).filter({ visible: true }).first().click({ timeout: 2_000 });
    await expect(page).toHaveURL(/\/login/, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);

  await expectAccessible(page, "Login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill("falsches-passwort-123");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.locator("form").getByRole("alert")).toBeVisible();

  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/feed/);
  const me = await page.request.get("/api/auth/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).email).toBe(email);
});
