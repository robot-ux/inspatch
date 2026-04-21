import { useState, useEffect, useRef, useCallback } from "react";
import { parseMessage, createLogger, DEFAULT_SERVER_PORT, type Message } from "@inspatch/shared";

const logger = createLogger("ws-client");

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

const INITIAL_BACKOFF = 1000;
const MAX_BACKOFF = 30_000;
const DISCONNECTED_THRESHOLD = 2_000;
const PING_INTERVAL = 20_000;
const PONG_TIMEOUT = 5_000;

async function broadcastConnectionState(url: string, connected: boolean) {
  try {
    await chrome.storage.session.set({
      serverConnected: connected,
      serverPort: parseInt(url.split(":").pop() || String(DEFAULT_SERVER_PORT), 10),
      connectedAt: connected ? Date.now() : null,
    });
  } catch {
    // storage API may not be available in all contexts
  }
  chrome.runtime.sendMessage({ type: "connection_status", connected }).catch(() => {});
}

interface UseWebSocketOptions {
  // Optional tab URL used to identify this side-panel session to the server.
  // Re-sent whenever it changes so the server's logs follow real tab switches.
  tabUrl?: string;
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
  const { tabUrl } = options;
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
  // Latest known tab URL (mirrored in a ref so the WS onopen handler can read
  // it without being re-created on every tab change).
  const tabUrlRef = useRef<string | undefined>(tabUrl);
  tabUrlRef.current = tabUrl;
  // What we last told the server about. Used to avoid re-sending identify on
  // no-op renders, and to re-send it after a reconnect.
  const lastSentTabUrlRef = useRef<string | undefined>(undefined);

  function sendIdentifyIfNeeded(ws: WebSocket) {
    const next = tabUrlRef.current;
    if (!next || ws.readyState !== WebSocket.OPEN) return;
    if (lastSentTabUrlRef.current === next) return;
    ws.send(JSON.stringify({ type: "identify", tabUrl: next }));
    lastSentTabUrlRef.current = next;
  }

  const cleanup = useCallback(() => {
    if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    cleanup();

    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(urlRef.current);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        backoffRef.current = INITIAL_BACKOFF;
        setStatus("connected");
        broadcastConnectionState(urlRef.current, true);
        // Reset tab-identify memory on every new socket so the server sees a
        // fresh identify (it doesn't persist across reconnects).
        lastSentTabUrlRef.current = undefined;
        sendIdentifyIfNeeded(ws);

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
          logger.warn("Invalid message from server:", parsed);
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);

        broadcastConnectionState(urlRef.current, false);

        const delay = backoffRef.current;
        setStatus(delay >= DISCONNECTED_THRESHOLD ? "disconnected" : "reconnecting");
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      if (!mountedRef.current) return;
      const delay = backoffRef.current;
      setStatus(delay >= DISCONNECTED_THRESHOLD ? "disconnected" : "reconnecting");
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

  // When the active tab changes while the socket is already open, push a new
  // identify so the server's logs reflect the switch immediately.
  useEffect(() => {
    const ws = wsRef.current;
    if (ws) sendIdentifyIfNeeded(ws);
  }, [tabUrl]);

  const send = useCallback((data: Message) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    } else {
      logger.warn("Cannot send — WebSocket not open");
    }
  }, []);

  const reconnect = useCallback(() => {
    backoffRef.current = INITIAL_BACKOFF;
    setStatus("reconnecting");
    connect();
  }, [connect]);

  return { status, lastMessage, send, reconnect };
}
