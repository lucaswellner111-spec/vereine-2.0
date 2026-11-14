// Feed, Benachrichtigungen und oeffentliche Seiten unter Last (angemeldete Nutzer + anonyme Besucher).
//   k6 run -e BASE_URL=https://staging.example.de -e LOADTEST_PASSWORD=... -e ACCOUNTS=100 -e VUS=100 infra/loadtest/feed.js
import http from "k6/http";
import { sleep } from "k6";
import { ACCOUNTS, BASE, apiThresholds, authed, guard, login, ok } from "./lib.js";

const VUS = Number(__ENV.VUS || 100);

export const options = {
  scenarios: {
    members: { executor: "ramping-vus", exec: "member", startVUs: 0, stages: [{ duration: "1m", target: VUS }, { duration: "4m", target: VUS }, { duration: "30s", target: 0 }] },
    visitors: { executor: "ramping-vus", exec: "visitor", startVUs: 0, stages: [{ duration: "1m", target: VUS }, { duration: "4m", target: VUS }, { duration: "30s", target: 0 }] },
  },
  thresholds: apiThresholds,
};

export function setup() {
  guard();
  const sessions = [];
  for (let n = 1; n <= ACCOUNTS; n++) sessions.push(login(n)); // einmal anmelden, nicht in der Messung
  return { sessions };
}

export function member(data) {
  const s = data.sessions[(__VU - 1) % data.sessions.length];
  for (const path of ["/feed", "/notifications?limit=20", "/feed?tag=fussball"]) ok(http.get(`${BASE}/api${path}`, authed(s)), path);
  sleep(3 + Math.random() * 5);
}

export function visitor() {
  ok(http.get(`${BASE}/`, { tags: { kind: "web" } }), "Startseite");
  ok(http.get(`${BASE}/api/public/orgs`, { tags: { kind: "api" } }), "Vereinsfinder");
  sleep(2 + Math.random() * 4);
}
