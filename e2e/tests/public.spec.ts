import { createOrgApi, expect, expectAccessible, signupApi, test, unique } from "./fixtures";

test("Oeffentliche Vereinsseite ohne Login", async ({ page, newContext }, info) => {
  await signupApi(page.request, "Pia", info);
  const name = `SG ${unique("Offen", info)}`;
  const slug = await createOrgApi(page.request, name);
  const on = await page.request.put(`/api/orgs/${slug}/public-page`, { data: { enabled: true } });
  expect(on.status()).toBe(200);

  // Neuer Kontext ohne Cookie = anonymer Besucher
  const anon = await (await newContext()).newPage();
  expect((await anon.request.get("/api/auth/me")).status()).toBe(401);
  await anon.goto(`/verein/${slug}`);
  await expect(anon.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(anon.getByText("Teststadt").first()).toBeVisible();
  await expectAccessible(anon, "oeffentliche Vereinsseite");

  // Ohne Freigabe gibt es die Seite nicht
  await page.request.put(`/api/orgs/${slug}/public-page`, { data: { enabled: false } });
  const res = await anon.goto(`/verein/${slug}`);
  expect(res?.status()).toBe(404);
});
