import type { Server } from "bun";
import { parseMessage, createLogger } from "@inspatch/shared";
import { openInEditor, type EditorScheme } from "./editor";
import { RequestQueue, type WSData } from "./queue";

const logger = createLogger("ws");

export const SERVER_VERSION = "0.0.1";

export type { EditorScheme };
export { detectEditor } from "./editor";

export function createServer(port: number, projectDir: string, editor: EditorScheme, timeoutMs = 1_800_000): Server<WSData> {
  const queue = new RequestQueue(projectDir, timeoutMs);

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
        return openInEditor(url, projectDir, editor);
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
        logger.info(`Connected: ${ws.data.id}`);
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
          logger.info(`Change request from ${ws.data.id}: "${msg.description}"`);
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
        logger.info(`Disconnected: ${ws.data.id} (${code} ${reason || ""})`);
      },
    },
  });

  return server;
}
