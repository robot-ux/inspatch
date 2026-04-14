import { useState, useEffect, useRef, useCallback } from "react";
import { parseMessage, type Message } from "@inspatch/shared";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

const INITIAL_BACKOFF = 1000;
const MAX_BACKOFF = 30_000;
const PING_INTERVAL = 20_000;
const PONG_TIMEOUT = 5_000;

async function broadcastConnectionState(url: string, connected: boolean) {
  try {
    await chrome.storage.session.set({
      serverConnected: connected,
      serverPort: parseInt(url.split(":").pop() || "9377", 10),
      connectedAt: connected ? Date.now() : null,
    });
  } catch {
    // storage API may not be available in all contexts
  }
  chrome.runtime.sendMessage({ type: "connection_status", connected }).catch(() => {});
}

export function useWebSocket(url: string) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [lastMessage, setLastMessage] = useState<Message | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const pongTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);
  const urlRef = useRef(url);
  urlRef.current = url;

  const cleanup = useCallback(() => {
    if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    cleanup();

    try {
      console.log("[Inspatch] WebSocket connecting to", urlRef.current);
      const ws = new WebSocket(urlRef.current);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[Inspatch] WebSocket connected");
        if (!mountedRef.current) return;
        backoffRef.current = INITIAL_BACKOFF;
        setStatus("connected");
        broadcastConnectionState(urlRef.current, true);

        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
            pongTimeoutRef.current = setTimeout(() => {
              ws.close();
            }, PONG_TIMEOUT);
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }

        if (parsed && typeof parsed === "object" && "type" in parsed) {
          if ((parsed as { type: string }).type === "pong") {
            if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
            return;
          }
        }

        const result = parseMessage(parsed);
        if (result.success) {
          setLastMessage(result.data);
        } else {
          console.warn("[Inspatch] Invalid message from server:", parsed);
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);

        broadcastConnectionState(urlRef.current, false);
        setStatus("reconnecting");

        const delay = backoffRef.current;
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = (err) => {
        console.warn("[Inspatch] WebSocket error:", err);
        ws.close();
      };
    } catch {
      if (!mountedRef.current) return;
      setStatus("reconnecting");
      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    }
  }, [cleanup]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      cleanup();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, cleanup]);

  const send = useCallback((data: Message) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    } else {
      console.warn("[Inspatch] Cannot send — WebSocket not open");
    }
  }, []);

  return { status, lastMessage, send };
}
