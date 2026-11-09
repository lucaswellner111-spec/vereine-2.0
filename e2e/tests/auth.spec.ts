import { expect, expectAccessible, lastMailApi, PASSWORD, signupApi, test, tokenFromMail, unique } from "./fixtures";

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

test("Registrieren, Link aus der Mail, Abmelden und wieder Anmelden", async ({ page }, info) => {
  const email = `${unique("reg", info)}@example.de`;

  await page.goto("/registrieren");
  await page.getByLabel("Anzeigename").fill("Erika E2E");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByLabel("Ich bin mindestens 16 Jahre alt.").check();
  await page.getByLabel(/Ich akzeptiere die/).check();
  await page.getByLabel(/Ich habe die/).check();
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await expect(page.getByRole("heading", { name: "Prüfe dein Postfach" })).toBeVisible();
  await expectAccessible(page, "Registrierung: Postfach pruefen");

  // Vor der Bestaetigung geht die Anmeldung nicht (gleiche Meldung wie falsches Passwort)
  expect((await page.request.post("/api/auth/login", { data: { email, password: PASSWORD } })).status()).toBe(401);

  // Link aus der Bestaetigungs-Mail oeffnen: angemeldet und weiter zum Feed
  const mail = await lastMailApi(page.request, email, "verify-email");
  const link = /(http:\/\/localhost:3000\/email-bestaetigen#t=[A-Za-z0-9_-]+)/.exec(mail.text)![1];
  expect(tokenFromMail(link)).not.toBe("");
  await page.goto(link);
  await expect(page).toHaveURL(/\/feed/);
  expect((await page.request.get("/api/auth/me")).status()).toBe(200);

  // Abmelden: am Handy unter Einstellungen, am Desktop in der Seitenleiste (jeweils der sichtbare Knopf)
  await page.goto("/einstellungen");
  // Unter Last kann der erste Klick vor der Hydration kommen: Klick wiederholen, bis die Seite wechselt
  // (Kam der vorige Klick an, aber der Seitenwechsel dauerte laenger als 3 s, ist der Knopf weg: dann nicht erneut klicken.)
  await expect(async () => {
    if (!/\/login/.test(page.url())) {
      await page.getByRole("button", { name: "Abmelden" }).filter({ visible: true }).first().click({ timeout: 2_000 });
    }
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

test("Passwort vergessen: Link aus der Mail, neues Passwort, alte Sitzung beendet", async ({ page, newContext }, info) => {
  const other = await newContext();
  const user = await signupApi(other.request, "Vergesslich", info);
  const newPassword = "ein-ganz-neues-e2e-passwort";

  await page.goto("/login");
  await page.getByRole("link", { name: "Passwort vergessen?" }).click();
  await expect(page.getByRole("heading", { name: "Passwort vergessen" })).toBeVisible();
  await expectAccessible(page, "Passwort vergessen");
  await page.getByLabel("E-Mail").fill(user.email);
  await page.getByRole("button", { name: "Link anfordern" }).click();
  await expect(page.getByRole("heading", { name: "Prüfe dein Postfach" })).toBeVisible();

  const mail = await lastMailApi(page.request, user.email, "password-reset");
  const link = /(http:\/\/localhost:3000\/passwort-neu#t=[A-Za-z0-9_-]+)/.exec(mail.text)![1];
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Neues Passwort" })).toBeVisible();
  await expectAccessible(page, "Neues Passwort");
  await page.getByLabel("Neues Passwort").fill(newPassword);
  await page.getByRole("button", { name: "Passwort speichern" }).click();
  await expect(page.getByRole("heading", { name: "Passwort geändert" })).toBeVisible();

  // Die vorher angemeldete Sitzung ist beendet, das neue Passwort gilt
  expect((await other.request.get("/api/auth/me")).status()).toBe(401);
  expect((await page.request.post("/api/auth/login", { data: { email: user.email, password: PASSWORD } })).status()).toBe(401);
  expect((await page.request.post("/api/auth/login", { data: { email: user.email, password: newPassword } })).status()).toBe(200);
});
