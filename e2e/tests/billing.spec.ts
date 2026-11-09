import { createOrgApi, expect, inviteTokenApi, joinViaInviteApi, signupApi, test, unique } from "./fixtures";

test("Rechnung anlegen, finalisieren und als PDF laden", async ({ page, newContext }, info) => {
  await signupApi(page.request, "Kassenwart", info);
  const slug = await createOrgApi(page.request, `SC ${unique("Kasse", info)}`);
  const token = await inviteTokenApi(page.request, slug);
  const ctx = await newContext();
  const member = await ctx.newPage();
  const mia = await signupApi(member.request, "Mia", info);
  await joinViaInviteApi(member.request, token);

  await page.goto("/verwaltung/rechnungen");
  await page.getByRole("button", { name: "Neue Rechnung" }).click();
  await page.getByLabel("Empfänger (aktives Mitglied)").selectOption({ label: mia.name });
  await page.getByLabel("Beschreibung 1").fill("Jahresbeitrag E2E");
  await page.getByLabel("Menge 1").fill("1");
  await page.getByLabel("Einzelpreis netto 1").fill("48,00");
  await page.getByRole("button", { name: "Als Entwurf speichern" }).click();

  const row = page.getByRole("row").filter({ hasText: mia.name });
  await expect(row.getByText("Entwurf", { exact: true }).first()).toBeVisible();
  await row.getByRole("button", { name: "Finalisieren" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Finalisieren" }).click();
  await expect(row.getByRole("button", { name: "Finalisieren" })).toHaveCount(0);
  await expect(row.getByText(/^\d{4}-/)).toBeVisible(); // fortlaufende Nummer statt "Entwurf"

  // PDF-Link liefert ein echtes PDF
  const href = await row.getByRole("link", { name: "PDF" }).getAttribute("href");
  expect(href).toMatch(/^\/api\/invoices\/[0-9a-f-]+\/pdf$/);
  const pdf = await page.request.get(href!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Empfaengerin sieht die finalisierte Rechnung und darf das PDF laden
  expect((await member.request.get(href!)).headers()["content-type"]).toContain("application/pdf");
});
