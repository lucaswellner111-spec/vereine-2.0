import { join } from "node:path";
import { expect, expectAccessible, openComposer, signupApi, test, unique } from "./fixtures";

const IMAGE = join(__dirname, "..", "fixtures", "bild.png");

test("Verein anlegen, Beitrag mit Bild schreiben und im Feed sehen", async ({ page }, info) => {
  await signupApi(page.request, "Vera", info);
  const orgName = `SV ${unique("Feed", info)}`;

  // Verein gruenden
  await page.goto("/vereine/neu");
  await page.getByLabel("Name des Vereins").fill(orgName);
  await page.getByLabel("Ort").fill("Teststadt");
  await page.getByLabel("Kurzbeschreibung").fill("Ein Verein aus dem E2E-Test.");
  await page.getByRole("button", { name: "Verein anlegen" }).click();
  await expect(page).toHaveURL(/\/vereine\/[a-z0-9-]+$/);
  await expect(page.getByRole("heading", { name: orgName })).toBeVisible();
  await expectAccessible(page, "Vereinsseite");

  // Beitrag mit Bild im Namen des Vereins
  await page.goto("/feed");
  await openComposer(page);
  const text = `Hallo aus dem E2E-Test ${unique("post", info)}`;
  await page.getByLabel("Neuer Beitrag").fill(text);
  await page.getByLabel(/^Bild anhängen/).setInputFiles(IMAGE);
  await expect(page.getByRole("list", { name: "Angehängte Bilder" }).getByRole("img")).toBeVisible();
  await page.getByLabel("Posten als").selectOption({ label: orgName });
  await page.getByRole("button", { name: "Veröffentlichen" }).click();
  await expect(page.getByText("Beitrag veröffentlicht.")).toBeVisible();

  // Nach dem Neuladen steht der Beitrag (mit Bild) im Feed
  await page.reload();
  await page.getByRole("tab", { name: "Neueste" }).click();
  const post = page.getByRole("listitem").filter({ hasText: text });
  await expect(post).toBeVisible();
  const img = post.locator("img[src*='/api/media/']").first();
  await expect(img).toBeVisible();
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await expectAccessible(page, "Feed");
});
