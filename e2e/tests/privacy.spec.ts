import { readFile } from "node:fs/promises";
import { expect, expectAccessible, signupApi, test } from "./fixtures";

test("Datenschutz-Export liefert JSON mit Profil", async ({ page }, info) => {
  const user = await signupApi(page.request, "Exportine", info);

  await page.goto("/einstellungen");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectAccessible(page, "Einstellungen");

  await page.goto("/einstellungen/datenschutz");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Daten herunterladen" }).click()]);
  expect(download.suggestedFilename()).toBe("meine-daten.json");
  const data = JSON.parse(await readFile((await download.path())!, "utf8"));
  const text = JSON.stringify(data);
  expect(text).toContain(user.email);
  expect(text).toContain(user.name);
  await expect(page.getByText("Deine Daten wurden heruntergeladen.")).toBeVisible();
});
