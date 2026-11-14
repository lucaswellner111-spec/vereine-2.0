// Gemeinsame Hilfen der k6-Lasttests (https://k6.io). Lauf NIE gegen Produktion mit echten Nutzern (siehe README.md).
import http from "k6/http";
import { check, fail } from "k6";

export const BASE = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
export const PASSWORD = __ENV.LOADTEST_PASSWORD || "";
export const ACCOUNTS = Number(__ENV.ACCOUNTS || 100);

// Zielwerte aus docs/ARCHITEKTUR.md (Auslöser für Ausbau): API p95 < 400 ms, Fehlerquote < 1 %,
// WebSocket-Latenz p95 < 500 ms, bis 2000 gleichzeitige Verbindungen auf einem Gateway.
export const TARGETS = { apiP95Ms: 400, errorRate: 0.01, wsLatencyP95Ms: 500, wsConnections: 2000, loginP95Ms: 1500 };

/** Schutz: nur localhost, Hosts mit "staging" im Namen oder .test/.invalid. Alles andere bricht ab. */
export function guard() {
  const host = BASE.replace(/^https?:\/\//, "").split(/[/:]/)[0];
  const ok = host === "localhost" || host === "127.0.0.1" || /(^|[.-])staging([.-]|$)/.test(host) || /\.(test|invalid|localhost)$/.test(host);
  if (!ok) fail(`Lasttest gegen ${host} verweigert: nur localhost oder Staging (Host muss "staging" enthalten). Nie gegen Produktion.`);
  if (!PASSWORD) fail("LOADTEST_PASSWORD fehlt (Passwort der Lasttest-Konten, siehe provision.mjs).");
}

export const email = (n) => `lt-${String(n).padStart(4, "0")}@loadtest.invalid`;

/** Meldet Konto n an und gibt { id, cookie } zurueck (Cookie "sid" fuer spaetere Anfragen). */
export function login(n) {
  const res = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: email(n), password: PASSWORD }), {
    headers: { "content-type": "application/json" },
    tags: { kind: "login" },
  });
  if (res.status !== 200) fail(`Login Konto ${n}: ${res.status} (provision.mjs gelaufen? Rate-Limit-Ausnahme LOADTEST_IP gesetzt?)`);
  const sid = res.cookies.sid && res.cookies.sid[0] && res.cookies.sid[0].value;
  if (!sid) fail(`Login Konto ${n}: kein Sitzungs-Cookie`);
  return { id: res.json("id"), cookie: `sid=${sid}` };
}

export const authed = (session, extra = {}) => ({ headers: { Cookie: session.cookie, ...(extra.headers || {}) }, tags: { kind: "api", ...(extra.tags || {}) } });

export function ok(res, name) {
  return check(res, { [`${name} < 400`]: (r) => r.status < 400 });
}

export const apiThresholds = {
  http_req_failed: [`rate<${TARGETS.errorRate}`],
  "http_req_duration{kind:api}": [`p(95)<${TARGETS.apiP95Ms}`],
};
