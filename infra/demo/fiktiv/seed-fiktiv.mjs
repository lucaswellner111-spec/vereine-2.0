// REIN FIKTIVER Demo-Verein fuer Screenshots und Vorfuehrungen: "TSV Beispielburg 1923".
// Alle Personen, Orte und Texte sind erfunden (Aehnlichkeiten mit lebenden Personen sind zufaellig und unbeabsichtigt),
// alle Bilder werden selbst erzeugt (graphics.mjs: Geometrie, keine Fotos, keine Personen). Keine Fremdlizenzen, kein Bildmaterial im Repo.
// Nutzt nur die oeffentliche API. Alle Konten enden auf @demo.klubnest.invalid (nicht zustellbar, per cleanup-demo.sh entfernbar).
//
//   DEMO_PASSWORD=... BASE_URL=https://staging.example.de node infra/demo/fiktiv/seed-fiktiv.mjs seed
//   DEMO_PASSWORD=... BASE_URL=https://staging.example.de node infra/demo/fiktiv/seed-fiktiv.mjs cleanup
//   node infra/demo/fiktiv/seed-fiktiv.mjs images     (schreibt die Grafiken nach infra/demo/fiktiv/out/ zur Ansicht)
// Empfohlen nur gegen Staging oder die Vorschau; vor dem Echtbetrieb cleanup (infra/demo/cleanup-demo.sh).
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { avatar, render } from "./graphics.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
const API = /^http:\/\/(localhost|127\.0\.0\.1):4000/.test(BASE) ? BASE : `${BASE}/api`;
const PASS = process.env.DEMO_PASSWORD;
const AUTH_PAUSE_MS = Number(process.env.AUTH_PAUSE_MS ?? 7000); // Anmelde-Aufrufe: 10/Minute je IP
const REQ_PAUSE_MS = Number(process.env.REQ_PAUSE_MS ?? 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = "demo.klubnest.invalid";
const email = (k) => `f-${k}@${D}`;

// Erfundene Personen (Phantasienamen), Handles mit Praefix "bb_" (Beispielburg)
const PEOPLE = {
  vorstand: { name: "Mara Quellenbach", handle: "bb_mara", bio: "Vorsitzende. Mag Kuchen und pünktliche Mitgliederversammlungen.", location: "Beispielburg" },
  kasse: { name: "Joris Wendlinger", handle: "bb_joris", bio: "Kasse und Zahlen. Rechnet auch beim Wandern.", location: "Beispielburg" },
  trainer: { name: "Ilvi Tannenschlag", handle: "bb_ilvi", bio: "Übungsleiterin Gymnastik und Jugend.", location: "Beispielburg" },
  fussball: { name: "Bruno Ostermeyl", handle: "bb_bruno", bio: "Abteilungsleiter Fußball. Kaffee vor dem Training.", location: "Beispielburg" },
  jugend: { name: "Nele Fahrenkamp", handle: "bb_nele", bio: "Jugendwartin. Zeltlager sind ihr Spezialgebiet.", location: "Beispielburg" },
  mitglied1: { name: "Tamo Rübensaat", handle: "bb_tamo", bio: "Läuft dienstags, redet donnerstags.", location: "Beispielburg" },
  mitglied2: { name: "Selma Birkenfeld-Aue", handle: "bb_selma", bio: "Seit 2019 dabei. Volleyball und Vereinsfeste.", location: "Beispielburg" },
  mitglied3: { name: "Kasimir Lindwurm", handle: "bb_kasimir", bio: "Neu im Verein, noch auf der Suche nach dem Schlüssel zum Geräteraum.", location: "Beispielburg" },
};
const ORG = {
  name: "TSV Beispielburg 1923",
  category: "Sport",
  city: "Beispielburg",
  about: "Der TSV Beispielburg ist ein erfundener Turn- und Sportverein für Demonstrationen: Fußball, Gymnastik, Volleyball und eine muntere Jugendabteilung. Alle Angaben auf dieser Seite sind frei erfunden.",
  tags: ["fussball", "jugendarbeit"],
};
const POSTS = [
  { as: "org", ageH: 3, text: "Saisonstart! Die erste Mannschaft trainiert ab Dienstag wieder um 19 Uhr. Neue Gesichter sind herzlich willkommen.", img: ["sunburst", "wald"] },
  { as: "org", ageH: 28, text: "Mitgliederversammlung am 12. des Monats im Vereinsheim. Die Tagesordnung hängt aus und steht hier in den Terminen.", img: ["grid", "himmel"] },
  { as: "fussball", ageH: 50, text: "Das Heimspiel am Sonntag beginnt um 15 Uhr. Kuchenspenden fürs Büfett nimmt Selma gern entgegen.", img: ["stripes", "wald"] },
  { as: "trainer", ageH: 96, text: "Gymnastik jetzt auch donnerstags um 18 Uhr. Matte mitbringen, Fragen gern hier in den Kommentaren.", img: ["waves", "himmel"] },
  { as: "org", ageH: 140, text: "Das Sommerfest braucht Helferinnen und Helfer: Aufbau, Grill, Kinderprogramm. Bitte bei Nele melden.", img: ["circles", "abend"] },
  { as: "jugend", ageH: 200, text: "Das Zeltlager der Jugend ist ausgebucht. Danke für das große Interesse, die Warteliste ist offen.", img: ["sunburst", "abend"] },
  { as: "kasse", ageH: 260, text: "Hinweis der Kasse: Die Mitgliedsbeiträge für das neue Jahr werden Anfang des Monats berechnet. Rechnungen kommen hier auf Klubnest." },
  { as: "org", ageH: 330, text: "Wir suchen Verstärkung für die Altherren-Mannschaft. Wer älter als 35 ist und gern Fußball spielt, kommt einfach vorbei." },
];
const COMMENTS = ["Bin dabei!", "Danke fürs Organisieren.", "Ich bringe einen Kuchen mit.", "Wann genau geht es los?", "Super, wir freuen uns darauf."];
const EVENTS = [
  ["Training Erste Mannschaft", 2, "Sportplatz Beispielburg"],
  ["Gymnastik", 3, "Turnhalle Beispielburg"],
  ["Mitgliederversammlung", 12, "Vereinsheim"],
  ["Sommerfest", 24, "Festwiese am Vereinsheim"],
];

class Session {
  constructor(key) { this.key = key; this.cookie = ""; this.id = null; }
  async req(method, path, body, form, attempt = 0) {
    await sleep(REQ_PAUSE_MS);
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    if (res.status === 429 && attempt < 5) { await sleep(20_000); return this.req(method, path, body, form, attempt + 1); }
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  }
  async ok(method, path, body, form) {
    const r = await this.req(method, path, body, form);
    if (r.status >= 400) throw new Error(`${this.key} ${method} ${path} -> ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    return r.data;
  }
  async upload(kind, buf, name) {
    const form = new FormData();
    form.append("file", new Blob([buf], { type: "image/png" }), name);
    return this.ok("POST", `/media/${kind}`, undefined, form);
  }
}

async function login(key) {
  const s = new Session(key);
  let r = await s.req("POST", "/auth/register", { email: email(key), password: PASS, displayName: PEOPLE[key].name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true });
  await sleep(AUTH_PAUSE_MS);
  if (r.status !== 201 && r.status !== 409) throw new Error(`register ${key}: ${r.status} ${JSON.stringify(r.data)}`);
  r = await s.req("POST", "/auth/login", { email: email(key), password: PASS });
  if (r.status !== 200) throw new Error(`login ${key}: ${r.status} ${JSON.stringify(r.data)}`);
  s.id = r.data.id;
  await sleep(AUTH_PAUSE_MS);
  return s;
}

async function seed() {
  if (!PASS || PASS.length < 12) throw new Error("DEMO_PASSWORD (mind. 12 Zeichen) fehlt.");
  const S = {};
  console.log("Konten anlegen ...");
  for (const [key, p] of Object.entries(PEOPLE)) {
    S[key] = await login(key);
    await S[key].ok("PUT", "/profiles/me", { handle: p.handle, displayName: p.name, bio: p.bio, location: p.location, visibility: "public" });
    await S[key].upload("avatar", avatar(p.name), `${key}.png`);
    console.log(" ", key);
  }

  console.log("Verein", ORG.name);
  const admin = S.vorstand;
  const existing = await admin.req("GET", "/orgs/tsv-beispielburg-1923");
  const slug = existing.status === 200 ? "tsv-beispielburg-1923" : (await admin.ok("POST", "/orgs", ORG)).slug;
  for (const key of Object.keys(PEOPLE).filter((k) => k !== "vorstand")) {
    await S[key].req("POST", `/orgs/${slug}/membership`);
    await admin.req("POST", `/orgs/${slug}/members/${S[key].id}/decision`, { decision: "approve" });
  }
  await admin.req("PUT", `/orgs/${slug}/members/${S.kasse.id}/role`, { role: "treasurer" });
  for (const [a, b] of [["mitglied1", "mitglied2"], ["mitglied2", "mitglied1"], ["trainer", "jugend"], ["mitglied3", "fussball"]]) await S[a].req("POST", `/profiles/${PEOPLE[b].handle}/follow`, {});

  for (const [title, days, location] of EVENTS) {
    const startsAt = new Date(Date.now() + days * 86400_000);
    startsAt.setHours(19, 0, 0, 0);
    const ev = await admin.ok("POST", `/orgs/${slug}/events`, { title, location, startsAt: startsAt.toISOString(), visibility: "public", description: "Alle Angaben sind erfunden." });
    for (const k of ["mitglied1", "mitglied2", "fussball"]) await S[k].req("PUT", `/events/${ev.id}/rsvp`, { status: "yes" });
  }

  const backdate = [];
  let ci = 0;
  for (const p of POSTS) {
    const author = p.as === "org" ? admin : S[p.as];
    const mediaIds = [];
    if (p.img) mediaIds.push((await author.upload("post", render(p.img[0], 960, 640, p.img[1]), `${p.img[0]}.png`)).id);
    const post = await author.ok("POST", "/posts", { body: p.text, kind: "update", mediaIds, ...(p.as === "org" ? { orgSlug: slug } : {}) });
    backdate.push({ id: post.id, ageH: p.ageH });
    const others = Object.keys(PEOPLE).filter((k) => k !== p.as && k !== "vorstand");
    for (const who of others.slice(0, 3)) await S[who].req("POST", `/posts/${post.id}/like`, {});
    for (const who of others.slice(1, 3)) await S[who].req("POST", `/posts/${post.id}/comments`, { body: COMMENTS[ci++ % COMMENTS.length] });
    process.stdout.write(".");
  }
  console.log("\nBeiträge angelegt.");

  await mkdir(join(HERE, "out"), { recursive: true });
  const sql = backdate.map((b) => `update social.posts set created_at = now() - interval '${b.ageH} hours' where id = '${b.id}';`).join("\n") + "\n";
  await writeFile(join(HERE, "out", "backdate.sql"), sql);
  console.log("Optional: Beiträge zeitlich verteilen mit infra/demo/fiktiv/out/backdate.sql (psql < Datei).");
}

async function cleanup() {
  if (!PASS) throw new Error("DEMO_PASSWORD fehlt.");
  for (const key of Object.keys(PEOPLE)) {
    const s = new Session(key);
    const r = await s.req("POST", "/auth/login", { email: email(key), password: PASS });
    await sleep(AUTH_PAUSE_MS);
    if (r.status !== 200) { console.log(key, "nicht angemeldet:", r.status); continue; }
    const d = await s.req("DELETE", "/privacy/account", { password: PASS });
    console.log(key, d.status === 204 ? "gelöscht" : `Fehler ${d.status}`);
    await sleep(AUTH_PAUSE_MS);
  }
  console.log("Verein ohne Mitglieder jetzt entfernen: infra/demo/cleanup-demo.sh (SQL mit festen Kennungen).");
}

async function images() {
  await mkdir(join(HERE, "out"), { recursive: true });
  for (const [kind, pal] of [["sunburst", "wald"], ["stripes", "wald"], ["waves", "himmel"], ["circles", "abend"], ["grid", "himmel"], ["crest", "wald"]]) {
    await writeFile(join(HERE, "out", `${kind}.png`), render(kind, 960, 640, pal));
  }
  await writeFile(join(HERE, "out", "avatar-beispiel.png"), avatar("Mara Quellenbach"));
  console.log("Grafiken in infra/demo/fiktiv/out/");
}

const cmd = process.argv[2];
if (cmd === "seed") await seed();
else if (cmd === "cleanup") await cleanup();
else if (cmd === "images") await images();
else console.log("Aufruf: node infra/demo/fiktiv/seed-fiktiv.mjs seed|cleanup|images");
