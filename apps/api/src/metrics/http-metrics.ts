import { monitorEventLoopDelay } from "node:perf_hooks";

/**
 * Minimale Prometheus-Messwerte ohne Zusatzbibliothek (Zaehler und Laufzeit-Verteilung je Statusklasse).
 * Bewusst ohne Pfad-Label: keine unbegrenzte Anzahl von Zeitreihen und keine Nutzer-IDs in den Messwerten.
 */
const BUCKETS = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
const requests = new Map<string, number>(); // "METHOD|2xx" -> Anzahl
const buckets = new Array<number>(BUCKETS.length + 1).fill(0); // kumulativ wird beim Ausgeben berechnet
let durationSum = 0;
let durationCount = 0;
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

export function recordRequest(method: string, status: number, seconds: number) {
  const key = `${method}|${Math.floor(status / 100)}xx`;
  requests.set(key, (requests.get(key) ?? 0) + 1);
  durationSum += seconds;
  durationCount += 1;
  const i = BUCKETS.findIndex((b) => seconds <= b);
  buckets[i === -1 ? BUCKETS.length : i] += 1;
}

export function renderHttpMetrics(): string {
  const lines = ["# TYPE klubnest_http_requests_total counter"];
  for (const [key, n] of requests) {
    const [method, cls] = key.split("|");
    lines.push(`klubnest_http_requests_total{method="${method}",status="${cls}"} ${n}`);
  }
  lines.push("# TYPE klubnest_http_request_duration_seconds histogram");
  let cum = 0;
  BUCKETS.forEach((b, i) => {
    cum += buckets[i];
    lines.push(`klubnest_http_request_duration_seconds_bucket{le="${b}"} ${cum}`);
  });
  lines.push(`klubnest_http_request_duration_seconds_bucket{le="+Inf"} ${durationCount}`);
  lines.push(`klubnest_http_request_duration_seconds_sum ${durationSum.toFixed(6)}`);
  lines.push(`klubnest_http_request_duration_seconds_count ${durationCount}`);
  const mem = process.memoryUsage();
  lines.push(
    "# TYPE process_resident_memory_bytes gauge",
    `process_resident_memory_bytes ${mem.rss}`,
    "# TYPE nodejs_heap_used_bytes gauge",
    `nodejs_heap_used_bytes ${mem.heapUsed}`,
    "# TYPE process_uptime_seconds gauge",
    `process_uptime_seconds ${Math.round(process.uptime())}`,
    "# TYPE nodejs_eventloop_lag_p99_seconds gauge",
    `nodejs_eventloop_lag_p99_seconds ${(loopDelay.percentile(99) / 1e9).toFixed(6)}`,
  );
  return lines.join("\n") + "\n";
}
