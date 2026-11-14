// Legt Lasttest-Konten (lt-0001@loadtest.invalid ...) und einen Test-Verein auf STAGING an (nur oeffentliche API).
//   LOADTEST_PASSWORD=... BASE_URL=https://staging.example.de ACCOUNTS=200 node infra/loadtest/provision.mjs create
//   LOADTEST_PASSWORD=... BASE_URL=https://staging.example.de ACCOUNTS=200 node infra/loadtest/provision.mjs delete
// Voraussetzung: Staging mit RATE_LIMIT_ALLOWLIST=<IP dieses Rechners> (docker-compose.staging.yml, LOADTEST_IP), sonst bremst das Limit.
// Verweigert alles ausser localhost und Hosts mit "staging". Das Passwort wird nie gespeichert oder ausgegeben.
const BASE = (process.env.BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
const PASS = process.env.LOADTEST_PASSWORD;
const N = Number(process.env.ACCOUNTS ?? 100);
const host = new URL(BASE).hostname;
if (!(host === "localhost" || host === "127.0.0.1" || /(^|[.-])staging([.-]|$)/.test(host))) throw new Error(`Verweigert: ${host} ist keine Staging-Umgebung.`);
if (!PASS || PASS.length < 12) throw new Error("LOADTEST_PASSWORD (mind. 12 Zeichen) fehlt.");
const API = /^http:\/\/(localhost|127\.0\.0\.1):4000/.test(BASE) ? BASE : `${BASE}/api`;
const email = (n) => `lt-${String(n).padStart(4, "0")}@loadtest.invalid`;
const ORG = "lasttest-verein";

async function call(cookie, method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.get("set-cookie");
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, cookie: set ? set.split(";")[0] : cookie };
}

async function session(n) {
  let r = await call(null, "POST", "/auth/register", { email: email(n), password: PASS, displayName: `Lasttest ${n}`, confirmAge16: true, acceptTerms: true, acceptPrivacy: true });
  if (r.status !== 201 && r.status !== 409 && r.status !== 200) throw new Error(`register ${n}: ${r.status}`);
  r = await call(null, "POST", "/auth/login", { email: email(n), password: PASS });
  if (r.status !== 200) throw new Error(`login ${n}: ${r.status}`);
  return { cookie: r.cookie, id: r.data.id };
}

const cmd = process.argv[2];
if (cmd === "create") {
  const admin = await session(1);
  await call(admin.cookie, "POST", "/orgs", { name: "Lasttest Verein", category: "Sport", city: "Teststadt", about: "Nur fuer Lasttests auf Staging.", tags: ["fussball"] });
  for (let n = 2; n <= N; n++) {
    const s = await session(n);
    await call(s.cookie, "POST", `/orgs/${ORG}/membership`);
    await call(admin.cookie, "POST", `/orgs/${ORG}/members/${s.id}/decision`, { decision: "approve" });
    if (n % 20 === 0) console.log(`${n}/${N}`);
  }
  const start = new Date(Date.now() + 3 * 86400_000);
  start.setHours(18, 0, 0, 0);
  await call(admin.cookie, "POST", `/orgs/${ORG}/events`, { title: "Lasttest-Training", location: "Sportplatz", startsAt: start.toISOString(), visibility: "public", description: "Testtermin" });
  await call(admin.cookie, "POST", "/posts", { body: "Lasttest-Beitrag", kind: "update", mediaIds: [], orgSlug: ORG });
  console.log(`Fertig: ${N} Konten, Verein ${ORG}.`);
} else if (cmd === "delete") {
  for (let n = 1; n <= N; n++) {
    const r = await call(null, "POST", "/auth/login", { email: email(n), password: PASS });
    if (r.status !== 200) continue;
    await call(r.cookie, "DELETE", "/privacy/account", { password: PASS });
  }
  console.log("Konten geloescht. Verein 'lasttest-verein' ggf. per SQL entfernen (siehe infra/demo/README.md, Muster).");
} else {
  console.log("Aufruf: node infra/loadtest/provision.mjs create|delete");
}
