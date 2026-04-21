import type { Server } from "bun";
import { parseMessage, createLogger } from "@inspatch/shared";
import { openInEditor, type EditorScheme } from "./editor";
import { RequestQueue, type WSData } from "./queue";

const logger = createLogger("ws");

export const SERVER_VERSION = "0.0.1";

export type { EditorScheme };
export { detectEditor } from "./editor";

// Returned so the CLI can wire Ctrl-C / SIGTERM handlers that cleanly tear
// down the server socket and every Claude subprocess owned by the pool.
export interface InspatchServer {
  server: Server<WSData>;
  shutdown(): void;
}

export function createServer(port: number, editor: EditorScheme, timeoutMs = 1_800_000): InspatchServer {
  const queue = new RequestQueue(timeoutMs);
  // Fallback base for relative paths passed to /open-in-editor. The server
  // itself is no longer bound to a project, so we use the directory the user
  // launched `npx @inspatch/server` from. Absolute paths ignore this.
  const openInEditorBase = process.cwd();

  const server = Bun.serve<WSData>({
    hostname: "127.0.0.1",
    port,
    // fetch must NOT be async — server.upgrade() requires a synchronous return
    // of undefined so Bun knows the request was handed off to the WebSocket handler.
    // Async paths (open-in-editor) are delegated to a separate async function.
    fetch(req, server) {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return Response.json({ status: "ok", version: SERVER_VERSION });
      }

      if (url.pathname === "/open-in-editor") {
        return openInEditor(url, openInEditorBase, editor);
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
        // Generic connect is debug-level; the meaningful info comes from the
        // extension's follow-up `identify` message (tab URL).
        logger.debug(`Socket opened: ${ws.data.id}`);
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

        if (msg.type === "identify") {
          const prev = ws.data.tabUrl;
          ws.data.tabUrl = msg.tabUrl;
          if (!prev) {
            logger.info(`Tab connected: ${msg.tabUrl}`);
          } else if (prev !== msg.tabUrl) {
            logger.info(`Tab switched: ${prev} → ${msg.tabUrl}`);
          }
          return;
        }

        if (msg.type === "change_request") {
          logger.info(`Change request from ${ws.data.tabUrl ?? ws.data.id}: "${msg.description}"`);
          queue.enqueue(msg, ws);
          return;
        }

        if (msg.type === "resume") {
          logger.info(`Resume request from ${ws.data.id}: ${msg.requestId}`);
          queue.handleResume(msg.requestId, ws);
          return;
        }

        if (msg.type === "plan_approval") {
          logger.info(`Plan ${msg.approve ? "approved" : "cancelled"} by ${ws.data.id}: ${msg.requestId}`);
          queue.handleApproval(msg.requestId, msg.approve, ws);
          return;
        }

        logger.info(`Received ${msg.type} from ${ws.data.id}`);
      },
      close(ws, code, reason) {
        if (ws.data.tabUrl) {
          logger.info(`Tab disconnected: ${ws.data.tabUrl}`);
        } else {
          logger.debug(`Socket closed: ${ws.data.id} (${code} ${reason || ""})`);
        }
      },
    },
  });

  return {
    server,
    shutdown() {
      try {
        server.stop();
      } catch {
        /* server may already be stopped */
      }
      queue.closePool();
    },
  };
}
