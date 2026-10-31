import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { Logger } from "@nestjs/common";
import { WebSocket, WebSocketServer } from "ws";
import { SESSION_COOKIE } from "../auth/session.guard";
import type { RealtimeBus } from "./realtime-bus";

export type GatewayAuth = { userForToken(token: string): Promise<{ id: string } | null> };

const MAX_SOCKETS_PER_USER = 5;
const HEARTBEAT_MS = 30_000;
const REVALIDATE_MS = 5 * 60_000;

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/**
 * WebSocket-Zustellung fuer den Chat (Pfad `/ws`). Fuehrt KEINE Chat-Logik und kennt keine Inhalte:
 * Er liest Ereignisse (nur IDs) vom Bus und reicht sie an die verbundenen Geraete der betroffenen Nutzer weiter.
 * Dadurch laesst er sich als eigener Container/Server betreiben und beliebig vervielfachen.
 */
export function attachChatGateway(
  server: Server,
  deps: { auth: GatewayAuth; bus: RealtimeBus; allowedOrigin?: string },
): { close(): Promise<void>; connections(): number } {
  const log = new Logger("ChatGateway");
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const sockets = new Map<string, Set<WebSocket>>();
  const meta = new WeakMap<WebSocket, { alive: boolean; token: string; userId: string }>();

  const reject = (socket: Duplex, status: number, text: string) => {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };

  server.on("upgrade", async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!req.url?.startsWith("/ws")) return; // andere Upgrades nicht anfassen
    try {
      // Schutz vor Cross-Site-WebSocket-Hijacking: Origin muss unsere Web-App sein.
      if (deps.allowedOrigin && req.headers.origin !== deps.allowedOrigin) return reject(socket, 403, "Forbidden");
      const token = cookieValue(req.headers.cookie, SESSION_COOKIE);
      const user = token ? await deps.auth.userForToken(token) : null;
      if (!token || !user) return reject(socket, 401, "Unauthorized");
      if ((sockets.get(user.id)?.size ?? 0) >= MAX_SOCKETS_PER_USER) return reject(socket, 429, "Too Many Requests");

      wss.handleUpgrade(req, socket, head, (ws) => {
        meta.set(ws, { alive: true, token, userId: user.id });
        const set = sockets.get(user.id) ?? new Set();
        set.add(ws);
        sockets.set(user.id, set);
        ws.on("pong", () => {
          const m = meta.get(ws);
          if (m) m.alive = true;
        });
        ws.on("message", () => undefined); // Client->Server-Nachrichten sind nicht vorgesehen
        ws.on("close", () => {
          set.delete(ws);
          if (set.size === 0) sockets.delete(user.id);
        });
        ws.on("error", () => ws.terminate());
        ws.send(JSON.stringify({ type: "ready" }));
      });
    } catch (e) {
      log.warn(`Upgrade fehlgeschlagen: ${(e as Error).message}`);
      reject(socket, 500, "Internal Server Error");
    }
  });

  void deps.bus.subscribe(({ userIds, event }) => {
    const payload = JSON.stringify(event);
    for (const id of userIds) {
      sockets.get(id)?.forEach((ws) => ws.readyState === WebSocket.OPEN && ws.send(payload));
    }
  });

  // Heartbeat: tote Verbindungen entfernen. Session regelmaessig neu pruefen (Logout/Loeschung beendet die Verbindung).
  const heartbeat = setInterval(() => {
    for (const set of sockets.values()) {
      for (const ws of set) {
        const m = meta.get(ws);
        if (!m?.alive) ws.terminate();
        else {
          m.alive = false;
          ws.ping();
        }
      }
    }
  }, HEARTBEAT_MS);
  const revalidate = setInterval(async () => {
    for (const set of sockets.values()) {
      for (const ws of set) {
        const m = meta.get(ws);
        if (m && !(await deps.auth.userForToken(m.token).catch(() => ({ id: "ok" })))) ws.close(4401, "session");
      }
    }
  }, REVALIDATE_MS);
  heartbeat.unref();
  revalidate.unref();

  return {
    connections: () => [...sockets.values()].reduce((n, s) => n + s.size, 0),
    async close() {
      clearInterval(heartbeat);
      clearInterval(revalidate);
      for (const set of sockets.values()) set.forEach((ws) => ws.terminate());
      wss.close();
    },
  };
}
