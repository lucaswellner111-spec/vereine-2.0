// Chat-WebSocket: gleichzeitige Verbindungen halten und die Zustell-Latenz messen.
// Jede VU bildet ein Paar: Konto A haelt die WebSocket-Verbindung, Konto B sendet per HTTP eine Nachricht an A.
// Latenz = Zeit von "B sendet" bis "Ereignis kommt bei A an". Grenzen: 5 Verbindungen je Konto, 30 Nachrichten/Min je Konto.
//   k6 run -e BASE_URL=https://staging.example.de -e LOADTEST_PASSWORD=... -e ACCOUNTS=200 -e VUS=100 infra/loadtest/chat-ws.js
// 2000 gleichzeitige Verbindungen (Zielwert ARCHITEKTUR.md) brauchen >= 400 Konten (je 5 Sockets): ACCOUNTS=400 VUS=400 CONNS_PER_VU=5.
import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";
import { ACCOUNTS, BASE, TARGETS, authed, guard, login } from "./lib.js";

const VUS = Number(__ENV.VUS || 100);
const HOLD_SEC = Number(__ENV.HOLD_SEC || 120);
const latency = new Trend("chat_delivery_ms", true);
const delivered = new Counter("chat_delivered");
const sendFailures = new Counter("chat_send_failures");

export const options = {
  scenarios: { pairs: { executor: "ramping-vus", startVUs: 0, stages: [{ duration: "1m", target: VUS }, { duration: "3m", target: VUS }, { duration: "30s", target: 0 }] } },
  thresholds: {
    chat_delivery_ms: [`p(95)<${TARGETS.wsLatencyP95Ms}`],
    chat_send_failures: ["count<5"],
    ws_connecting: ["p(95)<1000"],
  },
};

export function setup() {
  guard();
  const wsBase = BASE.replace(/^http/, "ws");
  const pairs = [];
  for (let n = 1; n + 1 <= ACCOUNTS; n += 2) {
    const a = login(n);
    const b = login(n + 1);
    const conv = http.post(`${BASE}/api/chat/conversations`, JSON.stringify({ kind: "direct", userId: a.id }), authed(b, { headers: { "content-type": "application/json" } }));
    if (conv.status >= 400) continue; // beide muessen im selben Verein sein (provision.mjs)
    pairs.push({ a, b, conversationId: conv.json("id") });
  }
  return { pairs, wsBase };
}

export default function (data) {
  const pair = data.pairs[(__VU - 1) % data.pairs.length];
  let sentAt = 0;
  const res = ws.connect(`${data.wsBase}/ws`, { headers: { Cookie: pair.a.cookie, Origin: BASE } }, (socket) => {
    socket.on("message", (raw) => {
      let ev;
      try { ev = JSON.parse(raw); } catch (_) { return; }
      if (ev.type === "ready" || !sentAt) return;
      latency.add(Date.now() - sentAt);
      delivered.add(1);
      sentAt = 0;
    });
    socket.setInterval(() => {
      sentAt = Date.now();
      const r = http.post(`${BASE}/api/chat/conversations/${pair.conversationId}/messages`, JSON.stringify({ body: `Lasttest ${Date.now()}` }), authed(pair.b, { headers: { "content-type": "application/json" } }));
      if (r.status >= 400) { sendFailures.add(1); sentAt = 0; }
    }, 10_000); // 6 Nachrichten/Minute je Paar, weit unter dem Limit von 30
    socket.setTimeout(() => socket.close(), HOLD_SEC * 1000);
  });
  check(res, { "WebSocket 101": (r) => r && r.status === 101 });
  sleep(1);
}
