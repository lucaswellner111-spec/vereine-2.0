// Lasttest-Skript (k6, https://k6.io): simuliert Besucher und angemeldete Nutzer.
// Start (gegen Staging, NIE gegen Produktion mit echten Nutzern):
//   k6 run -e BASE_URL=https://staging.example.de -e EMAIL=lasttest@example.de -e PASSWORD=... infra/loadtest/k6-smoke.js
// Ziel-Schwellen entsprechen docs/ARCHITEKTUR.md (API p95 < 400 ms, Fehlerquote < 1 %).
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    visitors: { executor: "ramping-vus", exec: "visitor", startVUs: 0, stages: [{ duration: "1m", target: 100 }, { duration: "3m", target: 100 }, { duration: "1m", target: 0 }] },
    members: { executor: "ramping-vus", exec: "member", startVUs: 0, stages: [{ duration: "1m", target: 50 }, { duration: "3m", target: 50 }, { duration: "1m", target: 0 }] },
  },
  thresholds: { http_req_failed: ["rate<0.01"], "http_req_duration{kind:api}": ["p(95)<400"] },
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";

export function visitor() {
  const res = http.get(`${BASE}/`);
  check(res, { "Startseite 200": (r) => r.status === 200 });
  http.get(`${BASE}/api/health/ready`, { tags: { kind: "api" } });
  sleep(2 + Math.random() * 3);
}

export function member() {
  const jar = http.cookieJar();
  const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: __ENV.EMAIL, password: __ENV.PASSWORD }), {
    headers: { "content-type": "application/json" },
    tags: { kind: "api" },
  });
  if (!check(login, { "Login 200": (r) => r.status === 200 })) return sleep(5);
  for (let i = 0; i < 10; i++) {
    for (const path of ["/feed", "/events", "/notifications?limit=20", "/chat/conversations"]) {
      check(http.get(`${BASE}/api${path}`, { tags: { kind: "api" } }), { [`${path} ok`]: (r) => r.status < 400 });
    }
    sleep(3 + Math.random() * 5);
  }
  jar.clear(BASE);
}
