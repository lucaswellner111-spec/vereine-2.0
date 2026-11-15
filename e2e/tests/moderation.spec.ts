import { createOrgApi, expect, inviteTokenApi, joinViaInviteApi, signupApi, test, unique } from "./fixtures";

test("Mitglied meldet einen Beitrag, Vorstand sieht die Meldung und erledigt sie", async ({ page, newContext }, info) => {
  await signupApi(page.request, "Vorstand", info);
  const slug = await createOrgApi(page.request, `TV ${unique("Mod", info)}`);
  const token = await inviteTokenApi(page.request, slug);
  const text = `Fragwuerdiger Beitrag ${unique("p", info)}`;
  const created = await page.request.post("/api/posts", { data: { body: text, orgSlug: slug } });
  expect(created.ok(), await created.text()).toBe(true);

  const ctx = await newContext();
  const member = await ctx.newPage();
  await signupApi(member.request, "Melderin", info);
  await joinViaInviteApi(member.request, token);

  // Mitglied meldet den Beitrag ueber das Beitragsmenue
  await member.goto("/feed");
  // Feed kann den frischen Beitrag erst beim naechsten Laden zeigen: neu laden, bis er da ist
  await expect(async () => {
    if (!(await member.getByText(text).isVisible())) await member.reload();
    await expect(member.getByText(text)).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 30_000 });
  const card = member.locator("div").filter({ hasText: text }).filter({ has: member.getByRole("button", { name: "Beitragsoptionen" }) }).last();
  await expect(async () => {
    await card.getByRole("button", { name: "Beitragsoptionen" }).click();
    await member.getByRole("menuitem", { name: /Melden/ }).click({ timeout: 2_000 });
    await expect(member.getByRole("dialog", { name: "Beitrag melden" })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await member.getByRole("group", { name: "Grund der Meldung" }).getByRole("button", { name: "Spam" }).click();
  await expect(member.getByRole("dialog", { name: "Beitrag melden" })).toBeHidden();

  // Vorstand sieht die Meldung in der Moderation
  await page.goto("/verwaltung/moderation");
  await expect(page.getByRole("heading", { name: /Moderation/ }).first()).toBeVisible();
  const report = page.getByRole("listitem").filter({ hasText: text });
  await expect(report).toBeVisible();
  await expect(report.getByText("Spam")).toBeVisible();

  // ... und lehnt sie ab; die Liste ist danach leer
  await report.getByRole("button", { name: "Meldung ablehnen" }).click();
  await expect(page.getByText("Keine offenen Meldungen.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: text })).toHaveCount(0);
});
