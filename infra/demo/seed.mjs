// Demo-Daten fuer Klubnest: 2 Vereine (Feuerwehr, Fussball), Vereinskonten, Mitglieder, Beitraege mit Bildern,
// Kommentare, Likes, Termine. NUR ueber die oeffentliche API (kein direkter Datenbankzugriff).
//
//   DEMO_PASSWORD=... BASE_URL=https://klubnest.de node infra/demo/seed.mjs seed
//   DEMO_PASSWORD=... BASE_URL=https://klubnest.de node infra/demo/seed.mjs cleanup   (loescht alle Demo-Konten)
//
// Alle Konten enden auf @demo.klubnest.invalid (nicht zustellbar, nur zum Aufraeumen erkennbar).
// Bilder liegen lokal in infra/demo/images (nicht im Repository). Das Passwort wird nie gespeichert.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
const API = BASE.startsWith("http://localhost:4000") || BASE.startsWith("http://127.0.0.1") ? BASE : `${BASE}/api`;
const PASS = process.env.DEMO_PASSWORD;
const HERE = dirname(fileURLToPath(import.meta.url));
const AUTH_PAUSE_MS = Number(process.env.AUTH_PAUSE_MS ?? 7000); // Anmelde-Aufrufe sind auf 10/Minute je IP begrenzt
const REQ_PAUSE_MS = Number(process.env.REQ_PAUSE_MS ?? 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!PASS || PASS.length < 12) throw new Error("DEMO_PASSWORD (mind. 12 Zeichen) fehlt.");

const D = "demo.klubnest.invalid";
const PEOPLE = {
  ffw: { name: "FF Wesenberg", handle: "ff_wesenberg", bio: "Offizieller Account der Freiwilligen Feuerwehr Wesenberg.", location: "Wesenberg", avatar: "fire-logo.png" },
  jens: { name: "Jens Becker", handle: "jens_becker", bio: "Gruppenführer, 18 Jahre dabei.", location: "Wesenberg" },
  marlene: { name: "Marlene Krüger", handle: "marlene_krueger", bio: "Atemschutz und Kameradschaft.", location: "Wesenberg" },
  tobias: { name: "Tobias Hoffmann", handle: "tobias_hoffmann", bio: "Kassenwart. Fragen zu Beiträgen gern per Nachricht.", location: "Wesenberg" },
  svenja: { name: "Svenja Lorenz", handle: "svenja_lorenz", bio: "Maschinistin und Jugendbetreuerin.", location: "Wesenberg" },
  dieter: { name: "Dieter Schulte", handle: "dieter_schulte", bio: "Ehrenmitglied. Früher Wehrführer.", location: "Wesenberg" },
  fcl: { name: "FC Lindenau", handle: "fc_lindenau", bio: "Offizieller Account des FC Blau-Weiß Lindenau.", location: "Lindenau", avatar: "fb-match.jpg" },
  paul: { name: "Paul Vogel", handle: "paul_vogel", bio: "Mittelfeld, Nr. 8. Samstags auf dem Platz.", location: "Lindenau" },
  lea: { name: "Lea Brandt", handle: "lea_brandt", bio: "Torhüterin der U17.", location: "Lindenau" },
  emre: { name: "Emre Yilmaz", handle: "emre_yilmaz", bio: "Trainer U15. Fußball ist das beste Mannschaftsspiel.", location: "Lindenau" },
  hannah: { name: "Hannah Richter", handle: "hannah_richter", bio: "Kassenwartin und Fan der ersten Stunde.", location: "Lindenau" },
  max: { name: "Max Wagner", handle: "max_wagner", bio: "Abwehr. Kaffee vor dem Training.", location: "Lindenau", private: true },
};
const email = (k) => `${k}@${D}`;

const ORGS = [
  { key: "ffw", slug: "freiwillige-feuerwehr-wesenberg", name: "Freiwillige Feuerwehr Wesenberg", category: "Feuerwehr", city: "Wesenberg", about: "Seit 1904 für die Sicherheit in Wesenberg: Brandschutz, Hilfeleistung und eine starke Jugendfeuerwehr. Mitmachen kann jede und jeder ab 10 Jahren.", members: ["jens", "marlene", "tobias", "svenja", "dieter"], treasurer: "tobias" },
  { key: "fcl", slug: "fc-blau-weiss-lindenau", name: "FC Blau-Weiß Lindenau", category: "Sport", city: "Lindenau", about: "Fußball für Groß und Klein: drei Herren-, zwei Damen- und acht Jugendmannschaften. Training dienstags und donnerstags auf dem Sportplatz am Weinberg.", members: ["paul", "lea", "emre", "hannah", "max"], treasurer: "hannah" },
];

// ageH = Alter in Stunden (spaeter per SQL zurueckdatiert), as = Autor ("org" = als Verein), img = Dateinamen
const POSTS = [
  { org: "ffw", as: "org", ageH: 2, text: "Danke an alle, die gestern beim Üben dabei waren! Die Zusammenarbeit zwischen Atemschutz und Maschinisten hat super geklappt. 🚒", img: ["fire-group-uniform.jpg"] },
  { org: "ffw", as: "org", ageH: 30, text: "Tag der offenen Tür am Samstag: Fahrzeugschau, Hüpfburg für die Kleinen, Würstchen vom Grill. Kommt vorbei und bringt Freunde mit!", img: ["fire-fest-red.jpg"] },
  { org: "ffw", as: "jens", ageH: 55, text: "Unser neues Gruppenfoto ist da. Danke an alle, die sich Zeit genommen haben – und an die Jugendfeuerwehr fürs Winken! 👋", img: ["fire-group-trucks.jpg"] },
  { org: "ffw", as: "org", ageH: 120, text: "Zum Jahresabschluss: Ehrungen für 10, 25 und 40 Jahre Dienstzeit. Herzlichen Glückwunsch und danke für euren Einsatz!", img: ["fire-group-helmets.jpg"] },
  { org: "ffw", as: "svenja", ageH: 170, text: "Neues Vereinslogo? Der Vorschlag aus der Jugend hat uns zum Lachen gebracht. 🍺😄", img: ["fire-beer-logo.jpg"] },
  { org: "ffw", as: "tobias", ageH: 240, text: "Hinweis vom Kassenwart: Die Jahresbeiträge werden Anfang des Monats eingezogen. Fragen gern direkt an mich." },
  { org: "ffw", as: "org", ageH: 330, text: "Wir suchen Verstärkung! Wer Lust hat, die Feuerwehr kennenzulernen, ist bei unserem nächsten Übungsabend herzlich willkommen." },
  { org: "fcl", as: "org", ageH: 3, text: "Gruppenfoto der U15 vor dem Saisonstart! Wir freuen uns auf viele Spiele und drücken die Daumen. ⚽💙", img: ["fb-youth-team.jpg"] },
  { org: "fcl", as: "org", ageH: 26, text: "Spieltag! Heimspiel gegen den Tabellenzweiten, Anstoß 15:00 Uhr am Sportplatz. Kuchenspenden sind willkommen.", img: ["fb-match.jpg"] },
  { org: "fcl", as: "emre", ageH: 52, text: "Starker Auftritt der Mädels heute – kämpferisch, fair und mit Spaß. Weiter so! 💪", img: ["fb-girls.jpg"] },
  { org: "fcl", as: "paul", ageH: 100, text: "Lauftraining im Herbstwald. Beine brennen, Stimmung top. Wer kommt Donnerstag wieder mit?", img: ["fb-training.jpg"] },
  { org: "fcl", as: "org", ageH: 190, text: "Helfer gesucht für das Sommerfest: Auf- und Abbau, Grill, Kuchenbüfett. Bitte meldet euch bei Hannah." },
  { org: "fcl", as: "hannah", ageH: 260, text: "Mitgliedsbeiträge für das neue Jahr sind fällig. Die Rechnungen kommen in den nächsten Tagen direkt hier auf Klubnest." },
  { org: "fcl", as: "lea", ageH: 400, text: "Zwei Elfmeter gehalten, einer ging rein – trotzdem 3:1 gewonnen! Danke an die Abwehr. 🧤" },
];
const COMMENTS = {
  ffw: ["Super Einsatz, Leute!", "Wir sind dabei, Samstag!", "Tolles Foto, danke fürs Organisieren.", "Gut gemacht, Respekt.", "Bin gespannt auf die nächste Übung."],
  fcl: ["Hopp, Lindenau!", "Bin Samstag mit der ganzen Familie da.", "Starkes Spiel, weiter so.", "Danke fürs Organisieren!", "Kuchen bringe ich mit. 🍰"],
};
const EVENTS = {
  ffw: [["Übungsabend", 4, "Gerätehaus Wesenberg"], ["Tag der offenen Tür", 9, "Gerätehaus Wesenberg"], ["Jahreshauptversammlung", 24, "Vereinsheim"]],
  fcl: [["Heimspiel Herren I", 3, "Sportplatz am Weinberg"], ["Training U15", 2, "Sportplatz am Weinberg"], ["Sommerfest-Planung", 12, "Vereinsheim"]],
};

// --- HTTP-Hilfen ------------------------------------------------------------------------------
class Session {
  constructor(key) { this.key = key; this.cookie = ""; this.id = null; }
  async req(method, path, body, form, attempt = 0) {
    await sleep(REQ_PAUSE_MS); // allgemeines Limit: 200 Anfragen/Minute je IP
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    if (res.status === 429 && attempt < 5) {
      await sleep(20_000);
      return this.req(method, path, body, form, attempt + 1);
    }
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
  async upload(kind, file) {
    const buf = await readFile(join(HERE, "images", file));
    const type = file.endsWith(".png") ? "image/png" : "image/jpeg";
    const form = new FormData();
    form.append("file", new Blob([buf], { type }), file);
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
  const S = {};
  console.log("Konten anlegen und anmelden ...");
  for (const key of Object.keys(PEOPLE)) {
    S[key] = await login(key);
    const p = PEOPLE[key];
    await S[key].ok("PUT", "/profiles/me", { handle: p.handle, displayName: p.name, bio: p.bio, location: p.location, visibility: p.private ? "private" : "public" });
    if (p.avatar) await S[key].upload("avatar", p.avatar);
    console.log(" ", key);
  }

  const orgSlugs = {};
  for (const o of ORGS) {
    console.log("Verein", o.name);
    const admin = S[o.key];
    const existing = await admin.req("GET", `/orgs/${o.slug}`);
    const slug = existing.status === 200 ? o.slug : (await admin.ok("POST", "/orgs", { name: o.name, category: o.category, city: o.city, about: o.about })).slug;
    orgSlugs[o.key] = slug;
    for (const m of o.members) {
      await S[m].req("POST", `/orgs/${slug}/membership`);
      await admin.req("POST", `/orgs/${slug}/members/${S[m].id}/decision`, { decision: "approve" });
    }
    await admin.req("PUT", `/orgs/${slug}/members/${S[o.treasurer].id}/role`, { role: "treasurer" });
  }

  // Personen folgen sich (Profile mit Followern), ausser dem privaten Profil (Anfrage)
  const handles = Object.fromEntries(Object.entries(PEOPLE).map(([k, p]) => [k, p.handle]));
  const follows = [["jens", "marlene"], ["marlene", "jens"], ["svenja", "dieter"], ["tobias", "jens"], ["paul", "lea"], ["lea", "paul"], ["emre", "paul"], ["hannah", "emre"], ["paul", "max"], ["lea", "max"], ["jens", "paul"]];
  for (const [a, b] of follows) await S[a].req("POST", `/profiles/${handles[b]}/follow`, {});

  // Termine
  for (const o of ORGS) {
    for (const [title, days, location] of EVENTS[o.key]) {
      const startsAt = new Date(Date.now() + days * 86400_000);
      startsAt.setHours(18, 0, 0, 0);
      const ev = await S[o.key].ok("POST", `/orgs/${orgSlugs[o.key]}/events`, { title, location, startsAt: startsAt.toISOString(), visibility: "public", description: "Alle sind willkommen." });
      for (const m of o.members.slice(0, 3)) await S[m].req("PUT", `/events/${ev.id}/rsvp`, { status: "yes" });
    }
  }

  // Beitraege, Kommentare, Likes
  const backdate = [];
  let ci = 0;
  for (const p of POSTS) {
    const org = ORGS.find((o) => o.key === p.org);
    const author = p.as === "org" ? S[p.org] : S[p.as];
    const mediaIds = [];
    for (const f of p.img ?? []) mediaIds.push((await author.upload("post", f)).id);
    const post = await author.ok("POST", "/posts", { body: p.text, kind: "update", mediaIds, ...(p.as === "org" ? { orgSlug: orgSlugs[p.org] } : {}) });
    backdate.push({ id: post.id, ageH: p.ageH });
    const others = org.members.filter((m) => m !== p.as);
    for (const who of others.slice(0, 3)) await S[who].req("POST", `/posts/${post.id}/like`, {});
    for (const who of others.slice(1, 3)) await S[who].req("POST", `/posts/${post.id}/comments`, { body: COMMENTS[p.org][ci++ % COMMENTS[p.org].length] });
    process.stdout.write(".");
  }
  console.log("\nBeitraege angelegt.");

  await mkdir(join(HERE, "out"), { recursive: true });
  const sql = backdate.map((b) => `update social.posts set created_at = now() - interval '${b.ageH} hours' where id = '${b.id}';`).join("\n") + "\n";
  await writeFile(join(HERE, "out", "backdate.sql"), sql);
  await writeFile(join(HERE, "out", "orgs.json"), JSON.stringify(orgSlugs));
  console.log("SQL zum Zurueckdatieren: infra/demo/out/backdate.sql");
}

async function cleanup() {
  for (const key of Object.keys(PEOPLE)) {
    const s = new Session(key);
    const r = await s.req("POST", "/auth/login", { email: email(key), password: PASS });
    await sleep(AUTH_PAUSE_MS);
    if (r.status !== 200) { console.log(key, "nicht angemeldet:", r.status); continue; }
    const d = await s.req("DELETE", "/privacy/account", { password: PASS });
    console.log(key, d.status === 204 ? "geloescht" : `Fehler ${d.status}`);
    await sleep(AUTH_PAUSE_MS);
  }
  console.log("Vereine ohne Mitglieder jetzt per SQL entfernen (siehe infra/demo/README.md).");
}

const cmd = process.argv[2];
if (cmd === "seed") await seed();
else if (cmd === "cleanup") await cleanup();
else console.log("Aufruf: node infra/demo/seed.mjs seed|cleanup");
