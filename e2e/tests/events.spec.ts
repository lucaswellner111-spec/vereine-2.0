import { createOrgApi, expect, expectAccessible, inviteTokenApi, signupApi, test, unique } from "./fixtures";

/** datetime-local-Wert in N Tagen um 18:30 (lokale Zeit des Browsers = Europe/Berlin). */
function inDays(n: number) {
  const d = new Date(Date.now() + n * 86_400_000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T18:30`;
}

test("Termin anlegen, Mitglied tritt per Einladungslink bei und sagt zu", async ({ page, newContext }, info) => {
  await signupApi(page.request, "Vorstand", info);
  const slug = await createOrgApi(page.request, `TV ${unique("Termin", info)}`);
  const title = `Training ${unique("t", info)}`;

  // Vorstand legt den Termin in der Verwaltung an
  await page.goto("/verwaltung/termine");
  await page.getByLabel("Titel").fill(title);
  await page.getByLabel("Beginn").fill(inDays(3));
  await page.getByLabel("Ort", { exact: true }).fill("Sporthalle");
  await page.getByRole("button", { name: "Termin anlegen" }).click();
  await expect(page.getByText(title)).toBeVisible();
  const token = await inviteTokenApi(page.request, slug);

  // Zweites Konto: Einladungslink oeffnen, beitreten, zusagen
  const ctx = await newContext();
  const member = await ctx.newPage();
  await signupApi(member.request, "Mitglied", info);
  await member.goto(`/einladung/${token}`);
  await member.getByRole("button", { name: "Verein beitreten" }).click();
  await expect(member).toHaveURL(new RegExp(`/vereine/${slug}`));

  await member.goto("/kalender");
  await expect(member.getByRole("link", { name: title, exact: true })).toBeVisible();
  await expectAccessible(member, "Kalender");
  await member.getByRole("link", { name: title, exact: true }).click();
  await expect(member.getByRole("heading", { name: title })).toBeVisible();
  const rsvp = member.getByRole("group", { name: "Teilnahme" }).getByRole("button", { name: "Zusagen" });
  await rsvp.click();
  await expect(rsvp).toHaveAttribute("aria-pressed", "true");

  // Vorstand sieht die Zusage
  const eventId = member.url().split("/kalender/")[1];
  await page.goto(`/kalender/${eventId}`);
  await expect(page.getByRole("list", { name: "1 Zusagen" })).toBeVisible();
});
