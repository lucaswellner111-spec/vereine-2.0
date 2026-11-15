import { createOrgApi, expect, inviteTokenApi, joinViaInviteApi, signupApi, test, unique } from "./fixtures";

test("Beitragsklasse anlegen, Mitglied zuordnen, Beitragslauf erzeugt Entwurf", async ({ page, newContext }, info) => {
  await signupApi(page.request, "Kasse", info);
  const slug = await createOrgApi(page.request, `TC ${unique("Lauf", info)}`);
  const token = await inviteTokenApi(page.request, slug);
  const ctx = await newContext();
  const member = await ctx.newPage();
  const mia = await signupApi(member.request, "Mia", info);
  await joinViaInviteApi(member.request, token);

  // Beitragsklasse ueber die Oberflaeche anlegen
  await page.goto("/verwaltung/beitraege");
  // Klick kann vor der Hydration verpuffen: wiederholen, solange die Klasse noch nicht existiert
  await expect(async () => {
    const existing = await (await page.request.get(`/api/orgs/${slug}/fee-classes`)).json();
    if (existing.length === 0) {
      await page.getByLabel("Name", { exact: true }).fill("Erwachsene", { timeout: 3_000 });
      await page.getByLabel("Betrag (€)").fill("48,00", { timeout: 3_000 });
      await page.getByRole("button", { name: "Anlegen" }).click({ timeout: 2_000 });
    }
    await expect(page.getByRole("button", { name: "Erwachsene bearbeiten" })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });

  // Mitglied zuordnen (Stammdaten per API; Pflichtfeld joinedOn aus dem Register)
  const classes = await (await page.request.get(`/api/orgs/${slug}/fee-classes`)).json();
  expect(classes).toHaveLength(1);
  const rec = await (await page.request.get(`/api/orgs/${slug}/member-registry/${mia.id}`)).json();
  const put = await page.request.put(`/api/orgs/${slug}/member-registry/${mia.id}`, {
    data: { street: "", zip: "", city: "", phone: "", birthDate: "", guardianName: "", guardianEmail: "", notes: "", joinedOn: rec.joinedOn, feeClassId: classes[0].id },
  });
  expect(put.ok(), await put.text()).toBe(true);

  // Lauf: Klasse waehlen, Vorschau, Entwuerfe erzeugen
  await page.reload();
  const period = `E2E ${unique("z", info)}`;
  await page.getByLabel("Zeitraum").fill(period);
  await page.getByRole("checkbox", { name: /Erwachsene/ }).check();
  await page.getByRole("button", { name: "Vorschau" }).click();
  await expect(page.getByText("1 Entwürfe")).toBeVisible();
  await page.getByRole("button", { name: "Entwürfe erzeugen" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Entwürfe erzeugen" }).click();

  // Lauf ist ein Job: warten, bis er "fertig" ist
  const runRow = page.getByRole("row").filter({ hasText: period });
  await expect(runRow.getByText("fertig")).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await (await page.request.get(`/api/orgs/${slug}/fee-runs`)).json())[0].createdCount, { timeout: 15_000 }).toBe(1);

  // Entwurf erscheint in der Rechnungsliste
  await page.goto("/verwaltung/rechnungen");
  const row = page.getByRole("row").filter({ hasText: mia.name });
  await expect(row.getByText("Entwurf", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
});
