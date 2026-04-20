import type { ServerWebSocket } from "bun";
import type { ChangeRequest, DiffMode } from "@inspatch/shared";
import { createLogger } from "@inspatch/shared";
import { runClaude, getGitDiff, getGitModifiedFiles } from "./claude-runner";
import {
  cleanupSnapshot,
  computeSnapshotDiff,
  isGitRepo,
  snapshotProject,
} from "./snapshot-diff";

const logger = createLogger("queue");

// keep buffered results for 24 h as a safety-net cleanup; they are consumed
// (and deleted) as soon as a client resumes the matching requestId
const RESULT_BUFFER_TTL = 24 * 60 * 60 * 1000;

// how long a plan_proposal may wait for the user's approve/cancel before we
// drop it and free the queue slot
const PENDING_APPROVAL_TTL = 10 * 60 * 1000;

export type WSData = {
  connectedAt: number;
  id: string;
};

interface QueuedRequest {
  request: ChangeRequest;
  ws: ServerWebSocket<WSData>;
  enqueuedAt: number;
  // When set, this queue entry is the execution phase of a previously-approved plan.
  approvedPlan?: string;
}

interface PendingApproval {
  request: ChangeRequest;
  plan: string;
  ws: ServerWebSocket<WSData>;
  ts: number;
}

export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private projectDir: string;
  private timeoutMs: number;
  // completed results buffered until a client resumes or TTL expires
  private resultBuffer = new Map<string, { payload: string; ts: number }>();
  // currently-active ws per in-flight requestId (rebindable on reconnect)
  private inflightWs = new Map<string, ServerWebSocket<WSData>>();
  // plans awaiting user approve/cancel, keyed by requestId
  private pendingApprovals = new Map<string, PendingApproval>();

  constructor(projectDir: string, timeoutMs = 1_800_000) {
    this.projectDir = projectDir;
    this.timeoutMs = timeoutMs;
  }

  get length(): number {
    return this.queue.length;
  }

  get isProcessing(): boolean {
    return this.processing;
  }

  // Called when a reconnecting client sends { type: 'resume', requestId }
  handleResume(requestId: string, ws: ServerWebSocket<WSData>): void {
    this.cleanBuffer();
    this.cleanPendingApprovals();

    if (this.inflightWs.has(requestId)) {
      // rebind: all future pushes for this request go to the new ws
      logger.info(`Resume: rebinding ws for in-flight request ${requestId}`);
      this.inflightWs.set(requestId, ws);
      this.sendRaw(ws, JSON.stringify({
        type: "status_update",
        requestId,
        status: "analyzing",
        message: "Reconnected — still processing…",
      }));
    } else if (this.pendingApprovals.has(requestId)) {
      // replay the plan proposal so the user can approve/cancel after reconnect
      logger.info(`Resume: replaying pending plan for ${requestId}`);
      const pending = this.pendingApprovals.get(requestId)!;
      pending.ws = ws;
      this.sendRaw(ws, JSON.stringify({ type: "plan_proposal", requestId, plan: pending.plan }));
    } else if (this.resultBuffer.has(requestId)) {
      // replay the completed result and remove it from the buffer
      logger.info(`Resume: replaying buffered result for ${requestId}`);
      const { payload } = this.resultBuffer.get(requestId)!;
      this.sendRaw(ws, payload);
      this.resultBuffer.delete(requestId);
    } else {
      // server was restarted or requestId is stale
      logger.info(`Resume: not found for ${requestId}`);
      this.sendRaw(ws, JSON.stringify({ type: "resume_not_found", requestId }));
    }
  }

  // Called when the user approves or cancels a previously-proposed plan.
  handleApproval(requestId: string, approve: boolean, ws: ServerWebSocket<WSData>): void {
    this.cleanPendingApprovals();
    const pending = this.pendingApprovals.get(requestId);
    if (!pending) {
      logger.info(`Approval for unknown/expired plan ${requestId}`);
      this.sendRaw(ws, JSON.stringify({
        type: "status_update",
        requestId,
        status: "error",
        message: "Plan expired or was already handled. Please resend your change.",
      }));
      return;
    }

    this.pendingApprovals.delete(requestId);

    if (!approve) {
      logger.info(`Plan cancelled by user: ${requestId}`);
      this.sendStatus(ws, requestId, "complete", "Plan cancelled");
      this.sendResult(ws, requestId, true, undefined, undefined, undefined, "Plan cancelled by user.");
      return;
    }

    logger.info(`Plan approved, re-running Claude to execute: ${requestId}`);
    // Execute phase: enqueue a fresh run with the approved plan attached.
    // Force quick mode so Claude doesn't re-plan and actually edits.
    const execRequest: ChangeRequest = { ...pending.request, mode: "quick" };
    this.queue.push({ request: execRequest, ws, enqueuedAt: Date.now(), approvedPlan: pending.plan });
    this.process();
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
    const { request, ws, approvedPlan } = item;
    const { requestId } = request;

    // register so the ws can be rebound if the client reconnects mid-flight
    if (requestId) this.inflightWs.set(requestId, ws);

    const startTime = Date.now();
    logger.info(`Processing: "${request.description.slice(0, 80)}" [${requestId ?? "no-id"}]${approvedPlan ? " [executing approved plan]" : ""}`);

    const gitRepo = await isGitRepo(this.projectDir);
    let snapshotDir: string | null = null;
    // In Git projects we diff against the working tree; in non-Git projects we
    // snapshot text files up-front and diff against that snapshot afterwards.
    if (!gitRepo) {
      try {
        snapshotDir = await snapshotProject(this.projectDir);
      } catch (err) {
        logger.warn("Snapshot failed, diff will be unavailable:", err);
      }
    }

    try {
      const preRequestFiles = gitRepo
        ? new Set(await getGitModifiedFiles(this.projectDir))
        : new Set<string>();

      const result = await runClaude(
        request,
        this.projectDir,
        (status, message, streamText) => {
          this.sendStatus(this.resolveWs(requestId, ws), requestId, status, message, streamText);
        },
        { timeoutMs: this.timeoutMs, approvedPlan },
      );

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Plan-only outcome: no files touched, but we have a `## Plan` block.
      // Park the request in pendingApprovals and notify the client; skip the
      // diff-collection path below.
      if (result.success && result.plan && (!result.filesModified || result.filesModified.length === 0)) {
        logger.info(`Plan proposal ready in ${elapsed}s — awaiting user approval`);
        const target = this.resolveWs(requestId, ws);
        if (requestId) {
          this.pendingApprovals.set(requestId, { request, plan: result.plan, ws: target, ts: Date.now() });
          this.sendRaw(target, JSON.stringify({ type: "plan_proposal", requestId, plan: result.plan }));
        } else {
          this.sendStatus(target, requestId, "complete", "Plan ready");
          this.sendResult(target, requestId, true, result.plan, undefined, undefined, result.summary);
        }
      } else if (result.success) {
        let diff: string | null = null;
        let files: string[] | undefined;
        let diffMode: DiffMode | undefined;

        if (gitRepo) {
          const postRequestFiles = await getGitModifiedFiles(this.projectDir);
          const newlyDirty = postRequestFiles.filter(f => !preRequestFiles.has(f));
          const claudeFiles = [...new Set([...(result.filesModified ?? []), ...newlyDirty])];
          diff = await getGitDiff(this.projectDir, claudeFiles.length ? claudeFiles : undefined);
          files = claudeFiles.length > 0 ? claudeFiles : result.filesModified;
          diffMode = "git";
        } else if (snapshotDir) {
          const claudeFiles = result.filesModified ?? [];
          if (claudeFiles.length) {
            diff = await computeSnapshotDiff(this.projectDir, snapshotDir, claudeFiles);
          }
          files = claudeFiles;
          diffMode = "snapshot";
        } else {
          files = result.filesModified;
        }

        logger.info(`Done in ${elapsed}s — ${files?.length ?? 0} file(s) modified: ${files?.join(", ") ?? "none"}`);
        const target = this.resolveWs(requestId, ws);
        this.sendStatus(target, requestId, "complete", "Changes applied successfully");
        this.sendResult(target, requestId, true, diff ?? result.resultText, files, undefined, result.summary, diffMode);
      } else {
        logger.warn(`Failed in ${elapsed}s — ${result.error}`);
        const target = this.resolveWs(requestId, ws);
        this.sendStatus(target, requestId, "error", result.error ?? "Unknown error");
        this.sendResult(target, requestId, false, undefined, undefined, result.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error";
      logger.error("Processing crashed:", msg);
      const target = this.resolveWs(requestId, ws);
      this.sendStatus(target, requestId, "error", msg);
      this.sendResult(target, requestId, false, undefined, undefined, msg);
    } finally {
      if (snapshotDir) await cleanupSnapshot(snapshotDir);
    }

    if (requestId) this.inflightWs.delete(requestId);
    this.processing = false;
    this.process();
  }

  // always use the most recently-bound ws for a given request
  private resolveWs(requestId: string | undefined, fallback: ServerWebSocket<WSData>): ServerWebSocket<WSData> {
    return (requestId ? this.inflightWs.get(requestId) : undefined) ?? fallback;
  }

  private cleanBuffer(): void {
    const cutoff = Date.now() - RESULT_BUFFER_TTL;
    for (const [id, { ts }] of this.resultBuffer) {
      if (ts < cutoff) this.resultBuffer.delete(id);
    }
  }

  private cleanPendingApprovals(): void {
    const cutoff = Date.now() - PENDING_APPROVAL_TTL;
    for (const [id, { ts }] of this.pendingApprovals) {
      if (ts < cutoff) {
        logger.info(`Pending approval expired: ${id}`);
        this.pendingApprovals.delete(id);
      }
    }
  }

  private sendRaw(ws: ServerWebSocket<WSData>, payload: string): void {
    try { ws.send(payload); } catch { /* client may have disconnected */ }
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
    this.sendRaw(ws, JSON.stringify(payload));
  }

  private sendResult(
    ws: ServerWebSocket<WSData>,
    requestId: string | undefined,
    success: boolean,
    resultText?: string,
    filesModified?: string[],
    error?: string,
    summary?: string,
    diffMode?: DiffMode,
  ): void {
    const payload: Record<string, unknown> = { type: "change_result", success };
    if (requestId) payload.requestId = requestId;
    if (resultText) payload.diff = resultText;
    if (diffMode) payload.diffMode = diffMode;
    if (filesModified?.length) payload.filesModified = filesModified;
    if (summary) payload.summary = summary;
    if (error) payload.error = error;
    const serialized = JSON.stringify(payload);
    // buffer so a reconnecting client can retrieve the result via 'resume'
    if (requestId) this.resultBuffer.set(requestId, { payload: serialized, ts: Date.now() });
    this.sendRaw(ws, serialized);
  }
}
