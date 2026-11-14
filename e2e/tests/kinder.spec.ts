import { createOrgApi, expect, expectAccessible, inviteTokenApi, signupApi, test, unique } from "./fixtures";

test("Eltern legen ein Kind an, melden es per Einladung an und koennen es loeschen", async ({ page }, info) => {
  await signupApi(page.request, "Elternteil", info);
  const slug = await createOrgApi(page.request, `SV ${unique("Kinder", info)}`);
  const token = await inviteTokenApi(page.request, slug);

  await page.goto("/kinder");
  await expect(page.getByRole("heading", { name: "Meine Kinder" })).toBeVisible();
  await expect(page.getByText("Was wir über dein Kind speichern")).toBeVisible();
  await expectAccessible(page, "Meine Kinder: leer");

  await page.getByRole("button", { name: /Kind hinzufügen/ }).click();
  await page.getByLabel("Vorname").fill("Lena");
  await page.getByLabel("Nachname").fill("Kowalski");
  const year = new Date().getFullYear() - 10;
  await page.getByLabel("Geburtsdatum").fill(`${year}-01-15`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Kind anlegen" }).click();

  await expect(page.getByRole("heading", { name: "Lena Kowalski" })).toBeVisible();
  await page.getByRole("button", { name: "Im Verein anmelden" }).click();
  await page.getByLabel("Einladungslink des Vereins").fill(`http://localhost/einladung/${token}`);
  await page.getByRole("button", { name: "Mit Einladung anmelden" }).click();
  await expect(page.getByText("Mitglied", { exact: true })).toBeVisible();
  await expectAccessible(page, "Kind: Detailseite");

  await page.getByRole("button", { name: "Jugendkonto löschen" }).click();
  await page.getByRole("alertdialog").getByLabel("Dein Passwort").fill("ein-sehr-langes-e2e-passwort");
  await page.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page.getByText("Noch kein Kind angelegt")).toBeVisible();
});
