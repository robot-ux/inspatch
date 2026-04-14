import type { ServerWebSocket } from "bun";
import type { ChangeRequest } from "@inspatch/shared";
import { createLogger } from "@inspatch/shared";
import { runClaude } from "./claude-runner";

const logger = createLogger("queue");

export type WSData = {
  connectedAt: number;
  id: string;
};

interface QueuedRequest {
  request: ChangeRequest;
  ws: ServerWebSocket<WSData>;
  enqueuedAt: number;
}

export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  get length(): number {
    return this.queue.length;
  }

  get isProcessing(): boolean {
    return this.processing;
  }

  enqueue(request: ChangeRequest, ws: ServerWebSocket<WSData>): void {
    this.queue.push({ request, ws, enqueuedAt: Date.now() });
    if (this.queue.length > 1) {
      this.sendStatus(ws, request.requestId, "queued", `Position ${this.queue.length} in queue`);
    }
    this.process();
  }

  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const item = this.queue.shift()!;
    const { request, ws } = item;

    const startTime = Date.now();
    logger.info(`Processing: "${request.description.slice(0, 80)}" [${request.requestId ?? "no-id"}]`);

    try {
      const result = await runClaude(
        request,
        this.projectDir,
        (status, message, streamText) => {
          this.sendStatus(ws, request.requestId, status, message, streamText);
        },
      );

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (result.success) {
        logger.info(`Done in ${elapsed}s — ${result.filesModified?.length ?? 0} file(s) modified`);
        this.sendStatus(ws, request.requestId, "complete", "Changes applied successfully");
        this.sendResult(ws, request.requestId, true, result.resultText, result.filesModified);
      } else {
        logger.warn(`Failed in ${elapsed}s — ${result.error}`);
        this.sendStatus(ws, request.requestId, "error", result.error ?? "Unknown error");
        this.sendResult(ws, request.requestId, false, undefined, undefined, result.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error";
      logger.error("Processing crashed:", msg);
      this.sendStatus(ws, request.requestId, "error", msg);
      this.sendResult(ws, request.requestId, false, undefined, undefined, msg);
    }

    this.processing = false;
    this.process();
  }

  private sendStatus(
    ws: ServerWebSocket<WSData>,
    requestId: string | undefined,
    status: string,
    message: string,
    streamText?: string,
  ): void {
    const payload: Record<string, unknown> = { type: "status_update", status, message };
    if (requestId) payload.requestId = requestId;
    if (streamText) payload.streamText = streamText;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Client may have disconnected
    }
  }

  private sendResult(
    ws: ServerWebSocket<WSData>,
    requestId: string | undefined,
    success: boolean,
    resultText?: string,
    filesModified?: string[],
    error?: string,
  ): void {
    const payload: Record<string, unknown> = {
      type: "change_result",
      success,
    };
    if (requestId) payload.requestId = requestId;
    if (resultText) payload.diff = resultText;
    if (filesModified?.length) payload.filesModified = filesModified;
    if (error) payload.error = error;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Client may have disconnected
    }
  }
}
