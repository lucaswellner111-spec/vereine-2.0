// Anmeldung unter Last. Anmelden ist wegen argon2id absichtlich teuer (CPU): eigener Zielwert, niedrigere Last als Feed.
//   k6 run -e BASE_URL=https://staging.example.de -e LOADTEST_PASSWORD=... -e ACCOUNTS=100 infra/loadtest/auth.js
import http from "k6/http";
import { sleep } from "k6";
import { ACCOUNTS, BASE, TARGETS, authed, email, guard, ok, PASSWORD } from "./lib.js";

export const options = {
  scenarios: {
    logins: { executor: "ramping-vus", startVUs: 0, stages: [{ duration: "1m", target: 20 }, { duration: "3m", target: 20 }, { duration: "30s", target: 0 }] },
  },
  thresholds: {
    http_req_failed: [`rate<${TARGETS.errorRate}`],
    "http_req_duration{kind:login}": [`p(95)<${TARGETS.loginP95Ms}`],
    "http_req_duration{kind:api}": [`p(95)<${TARGETS.apiP95Ms}`],
  },
};

export function setup() {
  guard();
}

export default function () {
  const n = ((__VU * 1000 + __ITER) % ACCOUNTS) + 1;
  const res = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: email(n), password: PASSWORD }), {
    headers: { "content-type": "application/json" },
    tags: { kind: "login" },
  });
  if (!ok(res, "Login")) return sleep(2);
  const sid = res.cookies.sid && res.cookies.sid[0] && res.cookies.sid[0].value;
  ok(http.get(`${BASE}/api/auth/me`, authed({ cookie: `sid=${sid}` })), "Eigenes Profil");
  http.post(`${BASE}/api/auth/logout`, null, authed({ cookie: `sid=${sid}` }));
  sleep(1 + Math.random() * 2);
}
