import { expect, expectAccessible, lastMailApi, test, unique } from "./fixtures";

test("Warteliste: Anmelden auf der Startseite, Mail, Link bestaetigen", async ({ page }, info) => {
  const email = `${unique("wl", info)}@example.de`;
  await page.goto("/#warteliste");
  const form = page.getByRole("form", { name: "Warteliste" });
  await form.getByLabel("E-Mail", { exact: true }).fill(email);
  await form.getByLabel("Name des Vereins").fill("SV Warteliste");
  await form.getByLabel("Ort (optional)").fill("Musterstadt");
  await form.getByLabel("Deine Rolle (optional)").selectOption("vorstand");

  // ohne Einwilligung kein Absenden
  await form.getByRole("button", { name: "Auf die Warteliste" }).click();
  await expect(form.getByText("Bitte bestätige die Einwilligung.")).toBeVisible();
  await expectAccessible(page, "Startseite: Warteliste mit Fehler");

  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Auf die Warteliste" }).click();
  await expect(page.getByRole("status").getByText(/Fast geschafft – schau in dein Postfach/)).toBeVisible();

  const mail = await lastMailApi(page.request, email, "waitlist-confirm");
  expect(mail.text).toContain("/warteliste/austragen#t=");
  const link = /\/warteliste\/bestaetigen#t=[A-Za-z0-9_-]+/.exec(mail.text)?.[0];
  expect(link).toBeTruthy();

  await page.goto(link!);
  await expect(page.getByRole("heading", { name: "Warteliste bestätigen" })).toBeVisible();
  await expectAccessible(page, "Warteliste bestaetigen");
  await page.getByRole("button", { name: "Anmeldung bestätigen" }).click();
  await expect(page.getByText("Danke, du stehst auf der Warteliste!")).toBeVisible();
  expect(new URL(page.url()).hash).toBe(""); // Token aus der Adresszeile entfernt

  // Link ist einmalig (erst weg navigieren, sonst waere es nur ein Sprung im Fragment)
  await page.goto("/impressum");
  await page.goto(link!);
  await page.getByRole("button", { name: "Anmeldung bestätigen" }).click();
  await expect(page.getByText("Der Link ist ungültig oder abgelaufen.")).toBeVisible();
});
