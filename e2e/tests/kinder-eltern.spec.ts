import { createOrgApi, expect, inviteTokenApi, lastMailApi, signupApi, test, unique, PASSWORD } from "./fixtures";

test("Zweiter Elternteil per Mail-Link, Datenexport und Loeschung mit Vorankuendigung", async ({ page, newContext }, info) => {
  await signupApi(page.request, "Mutter", info);
  const slug = await createOrgApi(page.request, `SV ${unique("Eltern", info)}`);
  const token = await inviteTokenApi(page.request, slug);
  const year = new Date().getFullYear() - 9;
  const created = await page.request.post("/api/guardian/children", {
    data: { firstName: "Jonas", lastName: "Berger", birthDate: `${year}-03-10`, confirmGuardian: true },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const child = await created.json();
  const join = await page.request.post(`/api/guardian/children/${child.id}/orgs`, { data: { token } });
  expect(join.ok(), await join.text()).toBe(true);

  // Zweites Konto (eigene, bestaetigte Adresse) wird eingeladen
  const ctx = await newContext();
  const vater = await ctx.newPage();
  const dad = await signupApi(vater.request, "Vater", info);

  await page.goto(`/kinder/${child.id}`);
  await expect(page.getByRole("heading", { name: "Jonas Berger" })).toBeVisible();
  await page.getByLabel("Zweiten Elternteil einladen").fill(dad.email);
  await page.getByRole("button", { name: "Einladung schicken" }).click();
  await expect(page.getByText("Die Einladung ist unterwegs.")).toBeVisible();

  // Link aus der Mail, Annahme im Konto des zweiten Elternteils
  const mail = await lastMailApi(page.request, dad.email, "guardian-invite");
  const link = /(http:\/\/localhost:\d+\/eltern-einladung\/[A-Za-z0-9_-]+)/.exec(mail.text)?.[1];
  expect(link, mail.text).toBeTruthy();
  await vater.goto(link!);
  await expect(vater.getByRole("heading", { name: "Einladung als Elternteil" })).toBeVisible();
  await expect(vater.getByText("Mutter", { exact: false }).first()).toBeVisible();
  await vater.getByLabel(/Ich bin für dieses Kind sorgeberechtigt/).check();
  await vater.getByRole("button", { name: "Einladung annehmen" }).click();
  await expect(vater).toHaveURL(new RegExp(`/kinder/${child.id}`));
  await expect(vater.getByRole("heading", { name: "Jonas Berger" })).toBeVisible();

  // Export der Kinddaten durch einen Elternteil
  const download = vater.waitForEvent("download");
  await vater.getByRole("button", { name: /Daten ansehen und herunterladen/ }).click();
  expect((await download).suggestedFilename()).toBe("daten-meines-kindes.json");

  // Loeschung mit zwei Eltern: Vorankuendigung statt sofort
  await vater.getByRole("button", { name: "Jugendkonto löschen" }).click();
  await vater.getByRole("alertdialog").getByLabel("Dein Passwort").fill(PASSWORD);
  await vater.getByRole("button", { name: "Löschung ankündigen" }).click();
  await expect(vater.getByText(/Du hast die Löschung des Jugendkontos beantragt/)).toBeVisible();
  await expect(vater.getByRole("button", { name: "Löschung zurückziehen" })).toBeVisible();

  // Kind existiert weiter; die Mutter sieht die Ankuendigung und kann widersprechen
  await page.reload();
  await expect(page.getByRole("heading", { name: "Jonas Berger" })).toBeVisible();
  await expect(page.getByText(/Dein Elternteil hat die Löschung des Jugendkontos beantragt/)).toBeVisible();
  await page.getByRole("button", { name: "Widersprechen" }).click();
  await expect(page.getByText(/die Löschung des Jugendkontos beantragt/)).toHaveCount(0);
  expect((await page.request.get(`/api/guardian/children/${child.id}`)).status()).toBe(200);
});
