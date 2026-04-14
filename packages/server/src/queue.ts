import type { ServerWebSocket } from "bun";
import type { ChangeRequest } from "@inspatch/shared";

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

  get length(): number {
    return this.queue.length;
  }

  get isProcessing(): boolean {
    return this.processing;
  }

  enqueue(request: ChangeRequest, ws: ServerWebSocket<WSData>): void {
    this.queue.push({ request, ws, enqueuedAt: Date.now() });
    this.process();
  }

  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const item = this.queue.shift()!;
    const { request, ws } = item;

    this.sendStatus(ws, request.requestId, "queued", "Request received and queued for processing");

    // Phase 6 wires actual Claude Code invocation here
    this.sendStatus(ws, request.requestId, "complete", "Processing pipeline not yet connected");

    this.processing = false;
    this.process();
  }

  private sendStatus(
    ws: ServerWebSocket<WSData>,
    requestId: string | undefined,
    status: string,
    message: string,
  ): void {
    const payload: Record<string, unknown> = { type: "status_update", status, message };
    if (requestId) payload.requestId = requestId;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Client may have disconnected
    }
  }
}
