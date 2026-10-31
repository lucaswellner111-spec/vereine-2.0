"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChatEvent } from "@vereine/shared";
import { api } from "./api";

type Handler = (event: ChatEvent | { type: "poll" }) => void;

type ChatState = {
  unread: number;
  live: boolean;
  subscribe: (handler: Handler) => () => void;
  refreshUnread: () => void;
};

const ChatContext = createContext<ChatState | null>(null);

const POLL_MS = 20_000;

/** Lokal laeuft die Web-App auf :3000, das Gateway steckt in der API auf :4000. Sonst gleicher Ursprung (/ws via Caddy). */
function socketUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const secure = location.protocol === "https:";
  const host = location.port === "3000" ? `${location.hostname}:4000` : location.host;
  return `${secure ? "wss" : "ws"}://${host}/ws`;
}

/**
 * Echtzeit fuer den Chat: WebSocket mit automatischem Wiederverbinden (Backoff). Faellt die Verbindung aus,
 * greift Polling (20 s) als Rueckfall, damit der Chat immer funktioniert. Ereignisse enthalten nur IDs;
 * Inhalte werden per REST geladen.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState(0);
  const [live, setLive] = useState(false);
  const handlers = useRef(new Set<Handler>());

  const refreshUnread = useCallback(() => {
    api<{ unread: number }>("/chat/unread").then((r) => setUnread(r.unread)).catch(() => undefined);
  }, []);

  const emit = useCallback((e: ChatEvent | { type: "poll" }) => handlers.current.forEach((h) => h(e)), []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;

    const startPolling = () => {
      if (poll) return;
      poll = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        refreshUnread();
        emit({ type: "poll" });
      }, POLL_MS);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = undefined;
    };

    const connect = () => {
      if (stopped) return;
      try {
        ws = new WebSocket(socketUrl());
      } catch {
        startPolling();
        return;
      }
      ws.onopen = () => {
        retry = 0;
        setLive(true);
        stopPolling();
        refreshUnread();
      };
      ws.onmessage = (m) => {
        try {
          const e = JSON.parse(String(m.data)) as ChatEvent | { type: "ready" };
          if (e.type === "ready") return;
          emit(e);
          if (e.type === "message" || e.type === "read") refreshUnread();
        } catch {
          /* ignorieren */
        }
      };
      ws.onclose = () => {
        setLive(false);
        startPolling();
        if (stopped) return;
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++)); // 1 s, 2 s, 4 s ... max 30 s
      };
      ws.onerror = () => ws?.close();
    };

    refreshUnread();
    connect();
    const onVisible = () => document.visibilityState === "visible" && refreshUnread();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      stopPolling();
      document.removeEventListener("visibilitychange", onVisible);
      ws?.close();
    };
  }, [emit, refreshUnread]);

  const subscribe = useCallback((h: Handler) => {
    handlers.current.add(h);
    return () => void handlers.current.delete(h);
  }, []);

  const value = useMemo(() => ({ unread, live, subscribe, refreshUnread }), [unread, live, subscribe, refreshUnread]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatState {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat braucht ChatProvider");
  return ctx;
}

/** Ruft `handler` bei jedem Chat-Ereignis auf (stabile Referenz nicht noetig). */
export function useChatEvents(handler: Handler) {
  const { subscribe } = useChat();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}
