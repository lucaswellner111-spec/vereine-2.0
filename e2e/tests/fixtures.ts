import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type APIRequestContext, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

export { expect };

export const PASSWORD = "ein-sehr-langes-e2e-passwort";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Datenschutz-Regel "keine Drittanbieter-Requests": jede Anfrage (auch WebSocket) eines Browser-Kontexts muss an
 * localhost gehen. data:/blob:-URLs sind lokal. Verstoesse werden gesammelt und lassen den Test am Ende scheitern.
 */
function guardContext(context: BrowserContext, foreign: string[]) {
  const check = (raw: string) => {
    const url = new URL(raw);
    if (url.protocol === "data:" || url.protocol === "blob:" || url.protocol === "about:") return;
    if (!LOCAL_HOSTS.has(url.hostname)) foreign.push(raw);
  };
  context.on("request", (r) => check(r.url()));
  context.on("page", (p) => p.on("websocket", (ws) => check(ws.url())));
  for (const p of context.pages()) p.on("websocket", (ws) => check(ws.url()));
}

export type User = { name: string; email: string; id: string };

let counter = 0;
/** Eindeutige Kennung je Lauf und Worker, damit Konten/Vereine sich nie ueberschneiden. */
export function unique(prefix: string, info: TestInfo): string {
  return `${prefix}-${Date.now().toString(36)}-${info.workerIndex}${info.parallelIndex}-${(counter++).toString(36)}`;
}

/**
 * Letzte Mail an eine Adresse aus dem Dev-Postfach des lokalen API-Servers (dev/pglite-server.ts, MAIL_DRIVER=log).
 * Mails werden im Job verschickt; kurz nachfragen, bis sie da ist.
 */
export async function lastMailApi(request: APIRequestContext, to: string, template: string): Promise<{ text: string; headers: Record<string, string> }> {
  let found: { text: string; headers: Record<string, string> } | null = null;
  await expect(async () => {
    const res = await request.get(`/api/__dev/mails?to=${encodeURIComponent(to)}&template=${template}`);
    expect(res.status()).toBe(200);
    found = await res.json();
  }).toPass({ timeout: 10_000 });
  return found!;
}

/** Token aus einem Mail-Link (#t=…). */
export const tokenFromMail = (text: string) => /#t=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";

/**
 * Konto ueber die API anlegen, per Link aus der Bestaetigungs-Mail bestaetigen und damit im Kontext anmelden
 * (Cookie landet im Kontext; Vorbedingung, kein Test-Flow).
 */
export async function signupApi(request: APIRequestContext, name: string, info: TestInfo): Promise<User> {
  const email = `${unique(name.toLowerCase(), info)}@example.de`;
  const reg = await request.post("/api/auth/register", {
    data: { email, password: PASSWORD, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
  });
  expect(reg.status(), await reg.text()).toBe(202);
  const mail = await lastMailApi(request, email, "verify-email");
  const confirm = await request.post("/api/auth/email/confirm", { data: { token: tokenFromMail(mail.text) } });
  expect(confirm.status(), await confirm.text()).toBe(200);
  const body = await confirm.json();
  expect(body.loggedIn).toBe(true);
  return { name, email, id: body.user.id };
}

export async function createOrgApi(request: APIRequestContext, name: string): Promise<string> {
  const res = await request.post("/api/orgs", { data: { name, category: "Sport", city: "Teststadt" } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).slug as string;
}

export async function inviteTokenApi(request: APIRequestContext, slug: string): Promise<string> {
  const res = await request.post(`/api/orgs/${slug}/invites`, { data: {} });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).token as string;
}

/** Mitglied per Einladungslink aufnehmen (Vorbedingung ueber die API). */
export async function joinViaInviteApi(request: APIRequestContext, token: string) {
  const res = await request.post(`/api/invites/${token}/accept`, { data: {} });
  expect(res.ok(), await res.text()).toBe(true);
}

/** axe-Pruefung: keine Verstoesse mit Auswirkung "serious" oder "critical". */
export async function expectAccessible(page: Page, label: string, opts: { exclude?: string[]; disable?: string[] } = {}) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  for (const sel of opts.exclude ?? []) builder = builder.exclude(sel);
  if (opts.disable?.length) builder = builder.disableRules(opts.disable);
  const result = await builder.analyze();
  const bad = result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 5).map((n) => n.target.join(" ")).join("\n  ")}`);
  expect(bad, `axe-Verstoesse auf ${label}`).toEqual([]);
}

/** Auf dem Handy ist das Beitragsfeld eingeklappt; diese Hilfe oeffnet es bei Bedarf. */
export async function openComposer(page: Page) {
  const opener = page.getByRole("button", { name: "Was gibt es Neues?" });
  const composer = page.getByLabel("Neuer Beitrag");
  await expect(opener.or(composer).first()).toBeVisible();
  // Klick kann vor der Hydrierung verpuffen, daher wiederholen, bis das Feld sichtbar ist
  await expect(async () => {
    if (await opener.isVisible()) await opener.click();
    await expect(composer).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

type Fixtures = {
  foreignRequests: string[];
  /** Weiterer, ebenfalls ueberwachter Browser-Kontext (zweites Konto). */
  newContext: () => Promise<BrowserContext>;
};

export const test = base.extend<Fixtures>({
  foreignRequests: [
    async ({ context }, use) => {
      const foreign: string[] = [];
      guardContext(context, foreign);
      await use(foreign);
      expect(foreign, "Anfragen an fremde Hosts").toEqual([]);
    },
    { auto: true },
  ],
  newContext: async ({ browser, foreignRequests }, use, info) => {
    const created: BrowserContext[] = [];
    await use(async () => {
      const u = info.project.use;
      const ctx = await (browser as Browser).newContext({
        viewport: u.viewport,
        userAgent: u.userAgent,
        deviceScaleFactor: u.deviceScaleFactor,
        isMobile: u.isMobile,
        hasTouch: u.hasTouch,
        colorScheme: u.colorScheme,
        baseURL: u.baseURL ?? "http://localhost:3000",
        locale: u.locale ?? "de-DE",
        timezoneId: u.timezoneId ?? "Europe/Berlin",
      });
      guardContext(ctx, foreignRequests);
      created.push(ctx);
      return ctx;
    });
    for (const c of created) await c.close();
  },
});
