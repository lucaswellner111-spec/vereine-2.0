// Termine: Liste, Details, Zu-/Absagen unter Last.
//   k6 run -e BASE_URL=https://staging.example.de -e LOADTEST_PASSWORD=... -e ACCOUNTS=100 infra/loadtest/events.js
import http from "k6/http";
import { sleep } from "k6";
import { ACCOUNTS, BASE, apiThresholds, authed, guard, login, ok } from "./lib.js";

const VUS = Number(__ENV.VUS || 80);

export const options = {
  scenarios: { members: { executor: "ramping-vus", startVUs: 0, stages: [{ duration: "1m", target: VUS }, { duration: "4m", target: VUS }, { duration: "30s", target: 0 }] } },
  thresholds: apiThresholds,
};

export function setup() {
  guard();
  const sessions = [];
  for (let n = 1; n <= ACCOUNTS; n++) sessions.push(login(n));
  return { sessions };
}

export default function (data) {
  const s = data.sessions[(__VU - 1) % data.sessions.length];
  const list = http.get(`${BASE}/api/events`, authed(s));
  ok(list, "Terminliste");
  let events = [];
  try { events = list.json(); } catch (_) { /* leere/ungueltige Antwort: ok() hat es schon gezaehlt */ }
  if (Array.isArray(events) && events.length) {
    const ev = events[Math.floor(Math.random() * events.length)];
    ok(http.get(`${BASE}/api/events/${ev.id}`, authed(s)), "Termindetail");
    // seltener: Zusage setzen (schreibend)
    if (Math.random() < 0.2) ok(http.put(`${BASE}/api/events/${ev.id}/rsvp`, JSON.stringify({ status: "yes" }), authed(s, { headers: { "content-type": "application/json" } })), "Zusage");
  }
  sleep(3 + Math.random() * 5);
}
