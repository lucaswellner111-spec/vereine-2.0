import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, expectAccessible, signupApi, test } from "./fixtures";

const IMAGE = join(__dirname, "..", "fixtures", "bild.png");

test("Aktivitaet: gebuendelte Likes, Erwaehnung, Tabs, Ausblenden, Weiterleitung der alten Adresse", async ({ page, newContext }, info) => {
  await signupApi(page.request, "Anna", info);
  const me = await (await page.request.get("/api/profiles/me")).json();
  const post = await (await page.request.post("/api/posts", { data: { body: "Beitrag fuer die Aktivitaet" } })).json();

  // Ben und Cleo liken, Ben erwaehnt Anna in einem Kommentar
  const ctx = await newContext();
  const ben = await ctx.newPage();
  await signupApi(ben.request, "Ben", info);
  expect((await ben.request.post(`/api/posts/${post.id}/like`, { data: {} })).ok()).toBe(true);
  expect((await ben.request.post(`/api/posts/${post.id}/comments`, { data: { body: `Toll @${me.handle}` } })).ok()).toBe(true);
  const ctx2 = await newContext();
  const cleo = await ctx2.newPage();
  await signupApi(cleo.request, "Cleo", info);
  expect((await cleo.request.post(`/api/posts/${post.id}/like`, { data: {} })).ok()).toBe(true);

  // Alte Adresse leitet um
  await page.goto("/benachrichtigungen");
  await expect(page).toHaveURL(/\/aktivitaet$/);
  await expect(page.getByRole("heading", { name: "Aktivität", level: 1 })).toBeVisible();

  // Gebuendelt: eine Zeile "Cleo und Ben ..." statt zwei Einzelzeilen
  const list = page.getByRole("tabpanel");
  await expect(list.getByRole("heading", { name: "Heute" })).toBeVisible();
  await expect(list.getByText("Cleo und Ben gefällt dein Beitrag.")).toBeVisible();
  await expect(list.getByText(/Ben hat kommentiert/)).toBeVisible();
  await expect(list.getByText("(ungelesen)").first()).toBeAttached();
  await expectAccessible(page, "Aktivitaet");

  // Tabs per Tastatur erreichbar
  await page.getByRole("tab", { name: "Gefällt mir" }).click();
  await expect(page.getByText("Noch nichts geliked.")).toBeVisible();
  await page.getByRole("tab", { name: "Kommentare" }).click();
  await expect(page.getByText("Noch nichts kommentiert.")).toBeVisible();
  await page.getByRole("tab", { name: "Benachrichtigungen" }).click();

  // Ausblenden (Knopf; auf dem Handy per Wischen oder fuer Hilfstechnik der verborgene Knopf)
  const hideLike = page.getByRole("button", { name: /^Ausblenden: Cleo und Ben/ });
  await hideLike.evaluate((el: HTMLElement) => el.click());
  await expect(list.getByText("Cleo und Ben gefällt dein Beitrag.")).toBeHidden();
  await page.reload();
  await expect(page.getByText("Cleo und Ben gefällt dein Beitrag.")).toBeHidden();
  await expect(page.getByText(/Ben hat kommentiert/)).toBeVisible();

  // Alle gelesen
  await page.getByRole("button", { name: "Alle gelesen" }).click();
  await expect(page.getByText("Alles gelesen.")).toBeVisible();
});

test("Beitrag: Doppeltipp aufs Bild, Like-Liste, Antwort und Kommentar-Like", async ({ page, newContext }, info) => {
  await signupApi(page.request, "Dora", info);
  const up = await page.request.post("/api/media/post", { multipart: { file: { name: "bild.png", mimeType: "image/png", buffer: readFileSync(IMAGE) } } });
  expect(up.ok(), await up.text()).toBe(true);
  const media = await up.json();
  const post = await (await page.request.post("/api/posts", { data: { body: "Bild zum Doppeltippen", mediaIds: [media.id] } })).json();

  const ctx = await newContext();
  const emil = await ctx.newPage();
  await signupApi(emil.request, "Emil", info);
  const emilHandle = (await (await emil.request.get("/api/profiles/me")).json()).handle as string;
  await emil.goto(`/beitrag/${post.id}`);
  const image = emil.getByRole("button", { name: /Bild 1 von 1 vergrößern/ });
  await expect(image).toBeVisible();
  await expect.poll(() => image.locator("img").evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

  // Doppeltipp = Gefaellt mir (und kein Lightbox-Dialog)
  await image.dblclick();
  await expect(emil.getByRole("button", { name: "Gefällt mir", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(emil.getByRole("dialog")).toHaveCount(0);

  // Like-Liste als Sheet
  await emil.getByRole("button", { name: /1 Person gefällt das, Liste anzeigen/ }).click();
  const sheet = emil.getByRole("dialog", { name: "Gefällt mir" });
  await expect(sheet.getByRole("link", { name: "Emil", exact: true }).first()).toBeVisible();
  await expectAccessible(emil, "Like-Liste");
  await emil.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // Emil kommentiert, Dora antwortet (eine Ebene) und liked den Kommentar
  await emil.getByLabel("Kommentar", { exact: true }).fill("Schoenes Bild");
  await emil.getByRole("button", { name: "Senden" }).click();
  await expect(emil.getByText("Schoenes Bild")).toBeVisible();

  await page.goto(`/beitrag/${post.id}`);
  await expect(page.getByText("Schoenes Bild")).toBeVisible();
  await page.getByRole("button", { name: "Antworten" }).click();
  await expect(page.getByLabel(/Antwort an Emil/)).toHaveValue(`@${emilHandle} `);
  await page.getByLabel(/Antwort an Emil/).fill(`@${emilHandle} Danke!`);
  await page.getByRole("button", { name: "Senden" }).click();
  await expect(page.getByText("Danke!")).toBeVisible();
  await page.getByRole("button", { name: /Kommentar von Emil: Gefällt mir/ }).click();
  await expect(page.getByRole("button", { name: /Kommentar von Emil: Gefällt mir, 1/ })).toHaveAttribute("aria-pressed", "true");
  await expectAccessible(page, "Beitrag mit Antworten");

  // Emil sieht die Antwort als Benachrichtigung
  await emil.goto("/aktivitaet");
  await expect(emil.getByText(/Dora hat auf deinen Kommentar geantwortet/)).toBeVisible();
  await expect(emil.getByText("Dora gefällt dein Kommentar.")).toBeVisible();
});
