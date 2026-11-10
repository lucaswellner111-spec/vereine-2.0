// Screenshots fuer Design-Vergleiche (docs/design/<ordner>/). Braucht laufende lokale Server:
//   npm run dev:pglite -w @vereine/api   und   npm run dev -w @vereine/web (oder Produktions-Build auf 3000)
// Start: node e2e/design-shots.mjs vorher|nachher
// Legt bei jedem Lauf frische Demodaten an (PGlite im Speicher), nur gegen localhost.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.DESIGN_BASE_URL ?? "http://localhost:3000";
const OUT = join(import.meta.dirname, "..", "docs", "design", process.argv[2] ?? "nachher");
const PASSWORD = "ein-sehr-langes-design-passwort";
const run = Date.now().toString(36);
mkdirSync(OUT, { recursive: true });

async function req(ctx, method, path, data) {
  const res = await ctx.request.fetch(`${BASE}/api${path}`, { method, data });
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${await res.text()}`);
  return res.status() === 204 ? null : res.json().catch(() => null);
}

async function lastMail(ctx, to, template) {
  for (let i = 0; i < 40; i++) {
    const res = await ctx.request.get(`${BASE}/api/__dev/mails?to=${encodeURIComponent(to)}&template=${template}`);
    if (res.ok()) return (await res.json()).text;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Keine Mail an " + to);
}

async function signup(ctx, name, handle) {
  const email = `${handle}-${run}@example.de`;
  await req(ctx, "POST", "/auth/register", { email, password: PASSWORD, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true });
  const token = /#t=([A-Za-z0-9_-]+)/.exec(await lastMail(ctx, email, "verify-email"))?.[1];
  const me = await req(ctx, "POST", "/auth/email/confirm", { token });
  await req(ctx, "PUT", "/profiles/me", { handle: `${handle}_${run}`.slice(0, 30), bio: "Mittelfeld beim SV, sonntags Kuchenbuffet 🍰", location: "Leipzig" });
  return { ...me.user, handle: `${handle}_${run}`.slice(0, 30) };
}

async function upload(ctx) {
  const res = await ctx.request.post(`${BASE}/api/media/post`, {
    multipart: { file: { name: "bild.png", mimeType: "image/png", buffer: readFileSync(join(import.meta.dirname, "fixtures", "bild.png")) } },
  });
  return res.ok() ? (await res.json()).id : null;
}

const browser = await chromium.launch();
const lena = await browser.newContext({ baseURL: BASE, locale: "de-DE", timezoneId: "Europe/Berlin" });
const tom = await browser.newContext({ baseURL: BASE, locale: "de-DE", timezoneId: "Europe/Berlin" });

const me = await signup(lena, "Lena Brandt", "lena");
const other = await signup(tom, "Tom Keller", "tom");
const org = await req(lena, "POST", "/orgs", { name: `SV Grünwald ${run}`, category: "Sport", city: "Leipzig", description: "Fußball, Turnen und ganz viel Herz seit 1923." });
const invite = await req(lena, "POST", `/orgs/${org.slug}/invites`, {});
await req(tom, "POST", `/invites/${invite.token}/accept`, {});

const img = await upload(lena);
const p1 = await req(lena, "POST", "/posts", { body: "Spieltag! ⚽ Heimspiel gegen den Tabellenzweiten, Anstoß 15 Uhr. Kuchenspenden sind willkommen.", orgSlug: org.slug, mediaIds: img ? [img] : [], tags: [] });
await req(tom, "POST", "/posts", { body: "Wer hat Lust auf Lauftraining am Donnerstag? Treffpunkt 18:30 am Vereinsheim 🏃", mediaIds: [], tags: [] });
await req(lena, "POST", "/posts", { body: "Danke an alle Helferinnen und Helfer beim Sommerfest – ihr wart großartig! 💚", mediaIds: [], tags: [] });
await req(tom, "POST", `/posts/${p1.id}/like`, {});
await req(tom, "POST", `/posts/${p1.id}/comments`, { body: "Ich bringe Apfelkuchen mit!" });
const start = new Date(Date.now() + 3 * 864e5);
start.setHours(18, 0, 0, 0);
await req(lena, "POST", `/orgs/${org.slug}/events`, { title: "Training Herren", location: "Sportplatz", startsAt: start.toISOString(), kind: "training", visibility: "members" }).catch(() => null);
try {
  const conv = await req(lena, "POST", "/chat/conversations", { kind: "direct", userId: other.id });
  await req(tom, "POST", `/chat/conversations/${conv.id}/messages`, { body: "Hey Lena, kommst du Donnerstag zum Training?" });
  await req(lena, "POST", `/chat/conversations/${conv.id}/messages`, { body: "Klar, bin dabei! 💪" });
} catch (e) {
  console.warn("Chat übersprungen:", e.message);
}

const pages = [
  ["start", "/", false],
  ["feed", "/feed", true],
  ["verein", `/vereine/${org.slug}`, true],
  ["profil", `/profil/${me.handle}`, true],
  ["chat", "/chat", true],
  ["kalender", "/kalender", true],
  ["einstellungen", "/einstellungen", true],
];
const sizes = [
  ["375", { width: 375, height: 812 }, true],
  ["desktop", { width: 1280, height: 860 }, false],
];
for (const scheme of ["light", "dark"]) {
  for (const [sizeName, viewport, mobile] of sizes) {
    const state = await lena.storageState();
    const ctx = await browser.newContext({ baseURL: BASE, viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, colorScheme: scheme, locale: "de-DE", timezoneId: "Europe/Berlin", storageState: state, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    for (const [name, path, auth] of pages) {
      if (scheme === "dark" && !["start", "feed", "profil"].includes(name)) continue;
      if (!auth) await ctx.clearCookies();
      // next dev liefert beim ersten Kompilieren gelegentlich 404: dann neu laden
      for (let i = 0; i < 4; i++) {
        const res = await page.goto(path, { waitUntil: "networkidle" });
        if (res?.status() !== 404) break;
        await page.waitForTimeout(1500);
      }
      await page.waitForTimeout(1800);
      await page.screenshot({ path: join(OUT, `${name}-${sizeName}${scheme === "dark" ? "-dunkel" : ""}.png`), fullPage: name === "start" ? false : false });
      if (!auth) await ctx.addCookies(state.cookies);
    }
    await ctx.close();
  }
}
await browser.close();
console.log("Screenshots in", OUT);
