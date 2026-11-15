import { createOrgApi, expect, expectAccessible, inviteTokenApi, joinViaInviteApi, signupApi, test, unique } from "./fixtures";

test("axe auf Chat, Profil und Verwaltungsseiten", async ({ page, newContext }, info) => {
  // Ohne Uebergaenge: sonst misst der Kontrastcheck Zwischenfarben von transition-colors
  await page.emulateMedia({ reducedMotion: "reduce" });
  const anna = await signupApi(page.request, "Anna", info);
  const slug = await createOrgApi(page.request, `FC ${unique("A11y", info)}`);
  const token = await inviteTokenApi(page.request, slug);
  const ctx = await newContext();
  const ben = await ctx.newPage();
  await signupApi(ben.request, "Ben", info);
  await joinViaInviteApi(ben.request, token);
  const created = await page.request.post("/api/posts", { data: { body: `Beitrag ${unique("p", info)}`, orgSlug: slug } });
  expect(created.ok(), await created.text()).toBe(true);

  await page.goto("/chat");
  await expect(page.getByRole("button", { name: "Neuer Chat" }).first()).toBeVisible();
  await expectAccessible(page, "Chat");

  const me = await page.request.get("/api/profiles/me");
  expect(me.ok(), await me.text()).toBe(true);
  const handle = (await me.json()).handle as string;
  await page.goto(`/profil/${handle}`);
  await expect(page.getByRole("heading", { name: anna.name }).first()).toBeVisible();
  await expectAccessible(page, "Profil");

  for (const [path, heading] of [
    ["/verwaltung/uebersicht", /Übersicht|Uebersicht/],
    ["/verwaltung/mitglieder", /Mitglieder/],
    ["/verwaltung/rechnungen", /Rechnungen/],
    ["/verwaltung/moderation", /Moderation/],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    await expectAccessible(page, path);
  }
});

test("Tastatur: Dialog mit Fokusfalle und Befehlspalette", async ({ page }, info) => {
  await signupApi(page.request, "Elternteil", info);
  await page.goto("/kinder");
  await page.getByRole("button", { name: /Kind hinzufügen/ }).click();
  await page.getByLabel("Vorname").fill("Lena");
  await page.getByLabel("Nachname").fill("Kowalski");
  await page.getByLabel("Geburtsdatum").fill(`${new Date().getFullYear() - 10}-01-15`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Kind anlegen" }).click();
  await expect(page.getByRole("heading", { name: "Lena Kowalski" })).toBeVisible();

  const trigger = page.getByRole("button", { name: "Jugendkonto löschen" });
  await expect(async () => {
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  const dialog = page.getByRole("alertdialog");
  const inDialog = () => dialog.evaluate((d) => d.contains(document.activeElement));
  expect(await inDialog()).toBe(true);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await inDialog(), `Tab ${i + 1} bleibt im Dialog`).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await inDialog()).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  // Befehlspalette: Strg+K oeffnet, Escape schliesst; "/" oeffnet ebenfalls
  const palette = page.getByRole("dialog", { name: "Befehlspalette" });
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("Control+k");
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("combobox")).toBeFocused();
  await expectAccessible(page, "Befehlspalette");
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await page.keyboard.press("/");
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
});
