import type { Server } from "bun";
import { parseMessage } from "@inspatch/shared";
import { RequestQueue, type WSData } from "./queue";

export const SERVER_VERSION = "0.0.1";

export function createServer(port: number): Server {
  const queue = new RequestQueue();

  const server = Bun.serve<WSData>({
    hostname: "127.0.0.1",
    port,
    fetch(req, server) {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return Response.json({ status: "ok", version: SERVER_VERSION });
      }

      const upgraded = server.upgrade(req, {
        data: { connectedAt: Date.now(), id: crypto.randomUUID() },
      });

      if (upgraded) return undefined;

      return new Response("WebSocket upgrade required", { status: 426 });
    },
    websocket: {
      idleTimeout: 60,
      open(ws) {
        console.log(`[ws] Connected: ${ws.data.id}`);
      },
      message(ws, raw) {
        const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          ws.send(JSON.stringify({
            type: "status_update",
            status: "error",
            message: "Invalid JSON",
          }));
          return;
        }

        if (parsed && typeof parsed === "object" && "type" in parsed) {
          const msg = parsed as { type: string };
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
            return;
          }
        }

        const result = parseMessage(parsed);
        if (!result.success) {
          ws.send(JSON.stringify({
            type: "status_update",
            status: "error",
            message: `Invalid message: ${result.error.issues.map(i => i.message).join(", ")}`,
          }));
          return;
        }

        const msg = result.data;

        if (msg.type === "change_request") {
          console.log(`[ws] Change request from ${ws.data.id}: "${msg.description}"`);
          queue.enqueue(msg, ws);
          return;
        }

        console.log(`[ws] Received ${msg.type} from ${ws.data.id}`);
      },
      close(ws, code, reason) {
        console.log(`[ws] Disconnected: ${ws.data.id} (${code} ${reason || ""})`);
      },
    },
  });

  return server;
}
