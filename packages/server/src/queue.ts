import { isAbsolute, resolve } from "node:path";
import type { ServerWebSocket } from "bun";
import type { ChangeRequest } from "@inspatch/shared";
import { createLogger } from "@inspatch/shared";
import { getGitModifiedFiles } from "./claude-runner";
import { resolveProjectRoot } from "./project-resolver";
import { TabAgentPool } from "./tab-agent-pool";

const logger = createLogger("queue");
const wsLogger = createLogger("ws");

// keep buffered results for 24 h as a safety-net cleanup; they are consumed
// (and deleted) as soon as a client resumes the matching requestId
const RESULT_BUFFER_TTL = 24 * 60 * 60 * 1000;

// how long a plan_proposal may wait for the user's approve/cancel before we
// drop it and free the queue slot
const PENDING_APPROVAL_TTL = 10 * 60 * 1000;

export type WSData = {
  connectedAt: number;
  id: string;
  // Set after the extension sends an `identify` message; updated on tab
  // switch. Used to annotate queue/enqueue logs and connection close logs.
  tabUrl?: string;
  // The project root most recently resolved for this tab. Used to decide
  // whether to log a "Tab linked to project" line when a new request arrives.
  lastProjectDir?: string;
};

interface QueuedRequest {
  request: ChangeRequest;
  ws: ServerWebSocket<WSData>;
  enqueuedAt: number;
  // Project root resolved from the request's own source path. Scopes this
  // run's Claude cwd — different requests on the same server can target
  // different projects.
  projectDir: string;
  // When set, this queue entry is the execution phase of a previously-approved plan.
  approvedPlan?: boolean;
}

interface PendingApproval {
  request: ChangeRequest;
  plan: string;
  ws: ServerWebSocket<WSData>;
  ts: number;
  projectDir: string;
}

export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private timeoutMs: number;
  // completed results buffered until a client resumes or TTL expires
  private resultBuffer = new Map<string, { payload: string; ts: number }>();
  // currently-active ws per in-flight requestId (rebindable on reconnect)
  private inflightWs = new Map<string, ServerWebSocket<WSData>>();
  // plans awaiting user approve/cancel, keyed by requestId
  private pendingApprovals = new Map<string, PendingApproval>();
  // long-lived per-conversation Claude agents (one subprocess per tab
  // conversation, reused across turns so Claude keeps context)
  private readonly pool: TabAgentPool;

  constructor(timeoutMs = 1_800_000, pool?: TabAgentPool) {
    this.timeoutMs = timeoutMs;
    this.pool = pool ?? new TabAgentPool();
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
      this.sendResult(ws, requestId, true, undefined, undefined, "Plan cancelled by user.");
      return;
    }

    logger.info(`Plan approved, resuming session to execute: ${requestId}`);
    // Execute phase: enqueue a fresh run marked `approvedPlan`. Route it
    // through the same long-lived TabAgent (same conversationId) so Claude
    // still has the plan in memory and just needs the nudge to execute.
    const execRequest: ChangeRequest = { ...pending.request, mode: "quick" };
    this.queue.push({
      request: execRequest,
      ws,
      enqueuedAt: Date.now(),
      approvedPlan: true,
      projectDir: pending.projectDir,
    });
    this.process();
  }

  enqueue(request: ChangeRequest, ws: ServerWebSocket<WSData>): void {
    const resolved = resolveProjectRoot(request);
    if ("error" in resolved) {
      logger.warn(`Rejecting change_request [${request.requestId ?? "no-id"}]: ${resolved.error}`);
      this.sendStatus(ws, request.requestId, "error", resolved.error);
      this.sendResult(ws, request.requestId, false, undefined, resolved.error);
      return;
    }

    // On the first request for this tab — or when the tab's project changes
    // (e.g. the user switched to another localhost app under a different
    // package.json) — emit a single "linked" line so the log clearly maps
    // tab ↔ project root without repeating it on every Enqueue.
    if (ws.data.lastProjectDir !== resolved.root) {
      const who = ws.data.tabUrl ?? ws.data.id;
      wsLogger.info(`Tab ${who} → project: ${resolved.root}`);
      ws.data.lastProjectDir = resolved.root;
    }

    const tab = ws.data.tabUrl ? ` (tab=${ws.data.tabUrl})` : "";
    logger.info(`Enqueue [${request.requestId ?? "no-id"}]${tab}`);
    this.queue.push({ request, ws, enqueuedAt: Date.now(), projectDir: resolved.root });
    if (this.queue.length > 1) {
      this.sendStatus(ws, request.requestId, "queued", `Position ${this.queue.length} in queue`);
    }
    this.process();
  }

  // Exposed so server.ts can tear down all Claude subprocesses on shutdown
  // and for tests that need to stop the idle-sweep timer.
  closePool(): void {
    this.pool.closeAll();
  }

  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const item = this.queue.shift()!;
    const { request, ws, approvedPlan, projectDir } = item;
    const { requestId } = request;

    // register so the ws can be rebound if the client reconnects mid-flight
    if (requestId) this.inflightWs.set(requestId, ws);

    const startTime = Date.now();
    logger.info(`Processing: "${request.description.slice(0, 80)}" [${requestId ?? "no-id"}]${approvedPlan ? " [executing approved plan]" : ""}`);

    try {
      // Snapshot the git working tree before this turn so we can identify
      // files Claude touched but forgot to list in its Summary block.
      // Returns [] silently for non-git projects, so no isGitRepo gate needed.
      const preRequestFiles = new Set(await getGitModifiedFiles(projectDir));

      const agent = this.pool.get(request.conversationId, projectDir);
      const result = await agent.sendTurn(request, {
        timeoutMs: this.timeoutMs,
        approvedPlan,
        onStatus: (status, message, streamText) => {
          this.sendStatus(this.resolveWs(requestId, ws), requestId, status, message, streamText);
        },
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Plan-only outcome: no files touched, but we have a `## Plan` block.
      // Park the request in pendingApprovals and notify the client.
      if (result.success && result.plan && (!result.filesModified || result.filesModified.length === 0)) {
        logger.info(`Plan proposal ready in ${elapsed}s — awaiting user approval`);
        const target = this.resolveWs(requestId, ws);
        if (requestId) {
          this.pendingApprovals.set(requestId, { request, plan: result.plan, ws: target, ts: Date.now(), projectDir });
          this.sendRaw(target, JSON.stringify({ type: "plan_proposal", requestId, plan: result.plan }));
        } else {
          this.sendStatus(target, requestId, "complete", "Plan ready");
          this.sendResult(target, requestId, true, undefined, undefined, result.summary, result.notes);
        }
      } else if (result.success) {
        // Merge Claude's self-report with git's view so the user still sees
        // silently-touched files. Claude's order wins (it's the "primary"
        // list); git-only dirt is appended.
        const claudeFiles = result.filesModified ?? [];
        const postRequestFiles = await getGitModifiedFiles(projectDir);
        const newlyDirty = postRequestFiles.filter((f) => !preRequestFiles.has(f) && !claudeFiles.includes(f));
        // Resolve to absolute paths so the extension's /open-in-editor call
        // doesn't depend on server-side cwd. The endpoint receives the same
        // abs string it got here and hands it straight to the editor scheme.
        const files = [...claudeFiles, ...newlyDirty].map((f) =>
          isAbsolute(f) ? f : resolve(projectDir, f),
        );

        logger.info(`Done in ${elapsed}s — ${files.length} file(s) modified: ${files.join(", ") || "none"}`);
        const target = this.resolveWs(requestId, ws);
        this.sendStatus(target, requestId, "complete", "Changes applied successfully");
        this.sendResult(target, requestId, true, files.length ? files : undefined, undefined, result.summary, result.notes);
      } else {
        logger.warn(`Failed in ${elapsed}s — ${result.error}`);
        const target = this.resolveWs(requestId, ws);
        this.sendStatus(target, requestId, "error", result.error ?? "Unknown error");
        this.sendResult(target, requestId, false, undefined, result.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error";
      logger.error("Processing crashed:", msg);
      const target = this.resolveWs(requestId, ws);
      this.sendStatus(target, requestId, "error", msg);
      this.sendResult(target, requestId, false, undefined, msg);
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
    filesModified?: string[],
    error?: string,
    summary?: string,
    notes?: string,
  ): void {
    const payload: Record<string, unknown> = { type: "change_result", success };
    if (requestId) payload.requestId = requestId;
    if (filesModified?.length) payload.filesModified = filesModified;
    if (summary) payload.summary = summary;
    if (notes) payload.notes = notes;
    if (error) payload.error = error;
    const serialized = JSON.stringify(payload);
    // buffer so a reconnecting client can retrieve the result via 'resume'
    if (requestId) this.resultBuffer.set(requestId, { payload: serialized, ts: Date.now() });
    this.sendRaw(ws, serialized);
  }
}
