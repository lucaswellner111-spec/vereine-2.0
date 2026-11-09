import { createOrgApi, expect, inviteTokenApi, joinViaInviteApi, signupApi, test, unique } from "./fixtures";

test("Chat zwischen zwei Konten (zwei Browser-Kontexte)", async ({ page, newContext }, info) => {
  await signupApi(page.request, "Anna", info);
  const slug = await createOrgApi(page.request, `FC ${unique("Chat", info)}`);
  const token = await inviteTokenApi(page.request, slug);

  const ctx = await newContext();
  const ben = await ctx.newPage();
  const benUser = await signupApi(ben.request, "Ben", info);
  await joinViaInviteApi(ben.request, token);

  // Anna startet eine Direktnachricht an Ben
  await page.goto("/chat");
  await page.getByRole("button", { name: "Neuer Chat" }).first().click();
  await page.getByLabel("Person suchen").fill(benUser.name);
  await page.getByRole("region", { name: "Neuer Chat" }).getByRole("button", { name: new RegExp(`^${benUser.name} `) }).click();
  const hello = `Hallo Ben ${unique("m", info)}`;
  const input = page.getByPlaceholder(/Nachricht schreiben/);
  await input.fill(hello);
  await page.getByRole("button", { name: "Senden" }).click();
  await expect(page.getByRole("region", { name: "Nachrichtenverlauf" }).getByText(hello)).toBeVisible();

  // Ben sieht die Unterhaltung und antwortet
  await ben.goto("/chat");
  await ben.getByRole("list", { name: "Unterhaltungen" }).getByText(hello).click();
  await expect(ben.getByRole("region", { name: "Nachrichtenverlauf" }).getByText(hello)).toBeVisible();
  const reply = `Hi Anna ${unique("r", info)}`;
  await ben.getByPlaceholder(/Nachricht schreiben/).fill(reply);
  await ben.getByRole("button", { name: "Senden" }).click();
  await expect(ben.getByRole("region", { name: "Nachrichtenverlauf" }).getByText(reply)).toBeVisible();

  // Anna bekommt die Antwort (Echtzeit oder spaetestens nach dem Neuladen)
  await page.goto("/chat");
  await page.getByRole("list", { name: "Unterhaltungen" }).getByText(reply).click();
  await expect(page.getByRole("region", { name: "Nachrichtenverlauf" }).getByText(reply)).toBeVisible();
});
