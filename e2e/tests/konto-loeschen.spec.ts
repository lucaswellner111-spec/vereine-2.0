import { expect, PASSWORD, signupApi, test } from "./fixtures";

test("Konto loeschen: falsches Passwort scheitert, danach ist keine Anmeldung mehr moeglich", async ({ page }, info) => {
  const user = await signupApi(page.request, "Loeschfall", info);

  await page.goto("/einstellungen/datenschutz");
  await expect(page.getByRole("heading", { name: "Konto löschen" })).toBeVisible();
  await page.getByRole("button", { name: "Konto löschen …" }).click();

  // Falsches Passwort: Fehler, Konto bleibt
  await page.getByLabel("Passwort zur Bestätigung").fill("falsches-passwort-123");
  await page.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await page.request.get("/api/auth/me")).status()).toBe(200);

  await page.getByLabel("Passwort zur Bestätigung").fill(PASSWORD);
  await page.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);

  // Anmeldung mit den alten Daten nicht mehr moeglich (generische Fehlermeldung)
  await page.getByLabel("E-Mail").fill(user.email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.locator("form").getByRole("alert")).toBeVisible({ timeout: 20_000 });
  await expect(page).not.toHaveURL(/\/feed/);
  expect((await page.request.post("/api/auth/login", { data: { email: user.email, password: PASSWORD } })).status()).toBe(401);
});
