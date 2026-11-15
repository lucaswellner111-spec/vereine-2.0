import { expect, expectAccessible, signupApi, test, PASSWORD } from "./fixtures";
import { totpCode } from "./totp";

test("Zwei-Faktor einrichten, danach verlangt die Anmeldung einen Code", async ({ page }, info) => {
  const user = await signupApi(page.request, "Zweifaktor", info);

  await page.goto("/einstellungen/sicherheit");
  await expect(page.getByRole("heading", { name: /Zwei-Faktor-Anmeldung/ })).toBeVisible();
  await page.getByRole("button", { name: "Einrichten" }).click();

  // Geheimnis steht als Text unter dem QR-Code
  const secretEl = page.locator("p.font-mono");
  await expect(secretEl).toBeVisible();
  const secret = ((await secretEl.textContent()) ?? "").trim();
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await expectAccessible(page, "Zwei-Faktor: Einrichten");

  await page.getByLabel("2. Code aus der App").fill(totpCode(secret));
  await page.getByRole("button", { name: "Aktivieren" }).click();
  await expect(page.getByText(/Notfallcodes – jetzt sicher aufbewahren/)).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: /^[A-Za-z0-9-]{8,}$/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Ich habe sie gesichert" }).click();
  await expect(page.getByText("10 Notfallcodes übrig")).toBeVisible();

  // Abmelden (per API; der Knopf-Weg ist in auth.spec.ts abgedeckt)
  expect((await page.request.post("/api/auth/logout")).ok()).toBe(true);
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);

  // Passwort allein reicht nicht mehr: Code wird verlangt
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(user.email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  const codeField = page.getByLabel("Code", { exact: true });
  await expect(codeField).toBeVisible();
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);

  // Falscher Code wird abgewiesen
  await codeField.fill("000000");
  await page.getByRole("button", { name: /Anmelden|Bestätigen/ }).click();
  await expect(page.locator("form").getByRole("alert")).toBeVisible();
  await expect(page).not.toHaveURL(/\/feed/);

  // Richtiger Code (naechster Zeitschritt, weil der des Aktivierens verbraucht ist)
  await codeField.fill(totpCode(secret, 1));
  await page.getByRole("button", { name: /Anmelden|Bestätigen/ }).click();
  await expect(page).toHaveURL(/\/feed/);
  expect((await page.request.get("/api/auth/me")).status()).toBe(200);
});
