// Bundle-Budget: wertet den Next-Build (.next) aus. Kein Netz, keine Zusatzpakete.
//   node scripts/check-bundle.mjs           Tabelle + Warnungen (Exit 0), Exit 1 nur bei deutlicher Ueberschreitung
//   BUNDLE_STRICT=1                         jede Ueberschreitung schlaegt fehl
// Erstes Laden je Route = Summe der gzip-Groesse aller JS-Dateien (gemeinsame Teile + Seite) laut Build-Manifest.
// Grenzen (docs/GROESSEN-BUDGET.md): Route > 170 KB gzip (Warnung) / > 250 KB (Fehler); .next/static > 3,5 MB (Warnung) / > 5 MB (Fehler).
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const dist = process.env.NEXT_DIST_DIR || ".next";
const ROUTE_WARN = 170 * 1024, ROUTE_FAIL = 250 * 1024;
const STATIC_WARN = 3.5 * 1024 * 1024, STATIC_FAIL = 5 * 1024 * 1024;
const strict = process.env.BUNDLE_STRICT === "1";

if (!existsSync(path.join(dist, "build-manifest.json"))) {
  console.error(`check-bundle: ${dist}/build-manifest.json fehlt, zuerst "next build".`);
  process.exit(2);
}

const gz = new Map();
const gzSize = (file) => {
  if (!gz.has(file)) gz.set(file, gzipSync(readFileSync(path.join(dist, file))).length);
  return gz.get(file);
};
const sum = (files) => [...new Set(files)].filter((f) => f.endsWith(".js") && existsSync(path.join(dist, f))).reduce((n, f) => n + gzSize(f), 0);

const build = JSON.parse(readFileSync(path.join(dist, "build-manifest.json"), "utf8"));
const base = [...(build.rootMainFiles ?? []), ...(build.polyfillFiles ?? [])];
const rows = [];

// App Router: je Seite die Chunks aus app-build-manifest.json
const appManifestPath = path.join(dist, "app-build-manifest.json");
if (existsSync(appManifestPath)) {
  const pages = JSON.parse(readFileSync(appManifestPath, "utf8")).pages ?? {};
  for (const [route, files] of Object.entries(pages)) {
    if (!route.endsWith("/page") || route.includes("/_")) continue;
    rows.push([route.replace(/\/page$/, "") || "/", sum([...base, ...files])]);
  }
}
for (const [route, files] of Object.entries(build.pages ?? {})) {
  if (route === "/_app" || route === "/_error") continue;
  rows.push([route, sum([...base, ...files])]);
}

const dirSize = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((n, e) => {
  const p = path.join(dir, e.name);
  return n + (e.isDirectory() ? dirSize(p) : statSync(p).size);
}, 0);
const staticBytes = dirSize(path.join(dist, "static"));

rows.sort((a, b) => b[1] - a[1]);
const kb = (n) => (n / 1024).toFixed(1).padStart(7);
console.log("Erstes Laden (JS, gzip) je Route:");
for (const [route, n] of rows) console.log(`${kb(n)} KB  ${route}${n > ROUTE_FAIL ? "  FEHLER" : n > ROUTE_WARN ? "  WARNUNG" : ""}`);
console.log(`\n${dist}/static gesamt: ${(staticBytes / 1024 / 1024).toFixed(2)} MB (Grenze ${(STATIC_WARN / 1024 / 1024).toFixed(1)} MB)`);

let fail = false;
const over = rows.filter(([, n]) => n > ROUTE_WARN);
if (over.length) console.warn(`\nWARNUNG: ${over.length} Route(n) laden erstmals mehr als 170 KB JS (gzip).`);
if (staticBytes > STATIC_WARN) console.warn(`WARNUNG: ${dist}/static ist groesser als 3,5 MB.`);
if (rows.some(([, n]) => n > ROUTE_FAIL) || staticBytes > STATIC_FAIL) fail = true;
if (strict && (over.length || staticBytes > STATIC_WARN)) fail = true;
if (fail) { console.error("\ncheck-bundle: Budget deutlich ueberschritten."); process.exit(1); }
