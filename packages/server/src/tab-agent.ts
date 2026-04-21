// Long-lived Claude Agent session for a single (tab × conversation).
//
// The SDK's streaming input mode lets us spawn ONE Query per conversation and
// keep it alive across turns. User messages are pushed through a shared async
// iterable; the SDK consumes them sequentially and emits assistant events +
// a `result` event per turn. Between turns we toggle permission mode:
// discuss → "plan" (read-only; Claude outputs a `## Plan` block as text),
// quick / approved → "acceptEdits" (Claude may Edit / Write / MultiEdit).
//
// One TabAgent == one Claude subprocess. Pooling / eviction / idle-sweep lives
// in tab-agent-pool.ts.

import {
  query,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ChangeRequest } from "@inspatch/shared";
import { createLogger } from "@inspatch/shared";
import {
  buildApprovalMessage,
  buildUserMessage,
  extractModifiedFiles,
  extractPlanBlock,
  extractSummaryParts,
  extractTextFromMessage,
  extractToolInputDetail,
  extractToolNameFromMessage,
  type RunResult,
  type StatusCallback,
} from "./claude-runner";
import { INSPATCH_SYSTEM_PROMPT } from "./prompts";

const logger = createLogger("claude");

// Simple pushable async iterable used as the `prompt` for the long-lived
// Query. Each `push` queues a user message; the SDK's consumer eventually
// awaits `next()` and receives it. `end()` closes the stream, which causes
// the Query to finish and release its subprocess.
class PushableMessages implements AsyncIterable<SDKUserMessage> {
  private buffer: SDKUserMessage[] = [];
  private pending: Array<(result: IteratorResult<SDKUserMessage>) => void> = [];
  private closed = false;

  push(msg: SDKUserMessage): void {
    if (this.closed) return;
    const waiter = this.pending.shift();
    if (waiter) {
      waiter({ value: msg, done: false });
    } else {
      this.buffer.push(msg);
    }
  }

  end(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.pending.length > 0) {
      this.pending.shift()!({ value: undefined as unknown as SDKUserMessage, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        if (this.buffer.length > 0) {
          return Promise.resolve({ value: this.buffer.shift()!, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as SDKUserMessage, done: true });
        }
        return new Promise((resolve) => this.pending.push(resolve));
      },
    };
  }
}

export interface SendTurnOptions {
  onStatus: StatusCallback;
  // When set, this turn executes a plan Claude proposed on a previous turn.
  // The plan text is already in Claude's conversation memory; we just nudge
  // it to execute and flip permission mode to `acceptEdits`.
  approvedPlan?: boolean;
  timeoutMs?: number;
}

interface ActiveTurn {
  requestId: string | undefined;
  onStatus: StatusCallback;
  resolve: (result: RunResult) => void;
  // Accumulates text from each assistant event so we can parse plan / summary
  // / modified-files from the final result text.
  fullText: string;
  resultText: string;
  currentStatus: string;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

export class TabAgent {
  readonly conversationId: string;
  readonly projectDir: string;
  private readonly inbox = new PushableMessages();
  private q: Query | null = null;
  private consumerDone: Promise<void> | null = null;
  private activeTurn: ActiveTurn | null = null;
  private closed = false;
  private _lastActive = Date.now();

  constructor(conversationId: string, projectDir: string) {
    this.conversationId = conversationId;
    this.projectDir = projectDir;
  }

  get lastActive(): number {
    return this._lastActive;
  }

  get isActive(): boolean {
    return this.activeTurn !== null;
  }

  // Streams a single turn through the long-lived Query. Returns when Claude
  // emits its per-turn `result` event. Callers must serialize turns — the
  // global RequestQueue already does this for us.
  async sendTurn(req: ChangeRequest, options: SendTurnOptions): Promise<RunResult> {
    if (this.closed) {
      return { success: false, error: "Tab session has been closed" };
    }
    if (this.activeTurn) {
      return { success: false, error: "A turn is already in flight on this tab session" };
    }

    this._lastActive = Date.now();
    this.ensureQuery();

    const timeoutMs = options.timeoutMs ?? 1_800_000;
    const planTurn = req.mode === "discuss" && !options.approvedPlan;
    const desiredMode = planTurn ? "plan" : "acceptEdits";

    try {
      await this.q!.setPermissionMode(desiredMode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "setPermissionMode failed";
      logger.error(`Failed to set permission mode to ${desiredMode}:`, msg);
      return { success: false, error: msg };
    }

    const userMessage = options.approvedPlan ? buildApprovalMessage() : buildUserMessage(req);

    logger.info(
      `[${this.conversationId.slice(0, 8)}] Turn: ${req.description.slice(0, 80)}${
        options.approvedPlan ? " (executing approved plan)" : ` (${req.mode})`
      }`,
    );
    options.onStatus("analyzing", "Starting Claude Code...");

    const result = await new Promise<RunResult>((resolve) => {
      const timeoutHandle = setTimeout(() => {
        logger.warn(`[${this.conversationId.slice(0, 8)}] Turn timeout, interrupting`);
        this.q?.interrupt().catch(() => {});
      }, timeoutMs);

      this.activeTurn = {
        requestId: req.requestId,
        onStatus: options.onStatus,
        resolve,
        fullText: "",
        resultText: "",
        currentStatus: "analyzing",
        timeoutHandle,
      };

      this.inbox.push(userMessage);
    });

    this._lastActive = Date.now();
    return result;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    // If a turn is stuck waiting for a result, fail it before tearing down.
    if (this.activeTurn) {
      const turn = this.activeTurn;
      this.activeTurn = null;
      if (turn.timeoutHandle) clearTimeout(turn.timeoutHandle);
      turn.resolve({ success: false, error: "Tab session was closed mid-turn" });
    }
    try {
      this.q?.close();
    } catch {
      /* already closed */
    }
    this.inbox.end();
    this.q = null;
  }

  private ensureQuery(): void {
    if (this.q) return;

    this.q = query({
      prompt: this.inbox,
      options: {
        cwd: this.projectDir,
        // allowedTools is fixed for the lifetime of the Query. `plan` permission
        // mode still blocks Edit / Write / MultiEdit at invocation time, so we
        // register the full set and let the mode toggle gate them per turn.
        allowedTools: ["Read", "Edit", "Write", "MultiEdit", "Bash", "Grep", "Glob"],
        permissionMode: "acceptEdits",
        // Keep the SDK's claude_code preset (for tool-use semantics) but append
        // Inspatch's UI-editor rules. The target project's CLAUDE.md is
        // intentionally NOT loaded (settingSources unset → SDK isolation).
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: INSPATCH_SYSTEM_PROMPT,
        },
      },
    });

    this.consumerDone = this.consume().catch((err) => {
      logger.error(`[${this.conversationId.slice(0, 8)}] Consumer crashed:`, err);
    });
  }

  private async consume(): Promise<void> {
    if (!this.q) return;
    try {
      for await (const msg of this.q) {
        this.handleSdkMessage(msg);
      }
    } finally {
      // If the Query ended while a turn is still waiting, resolve it as an
      // error so the caller unblocks. This happens on unexpected SDK exit.
      if (this.activeTurn) {
        const turn = this.activeTurn;
        this.activeTurn = null;
        if (turn.timeoutHandle) clearTimeout(turn.timeoutHandle);
        turn.resolve({ success: false, error: "Claude session ended unexpectedly" });
      }
    }
  }

  private handleSdkMessage(msg: SDKMessage): void {
    const turn = this.activeTurn;
    if (!turn) return; // between turns — ignore late events

    logger.debug(
      `[${this.conversationId.slice(0, 8)}] SDK event: ${msg.type}${
        msg.type === "result" ? ` ${(msg as { subtype?: string }).subtype ?? ""}` : ""
      }`,
    );

    if (msg.type === "assistant") {
      const text = extractTextFromMessage(msg);
      if (text) {
        turn.fullText = text;
        turn.onStatus(turn.currentStatus, "Claude is working...", text);
      }

      const toolName = extractToolNameFromMessage(msg);
      if (toolName) {
        const detail = extractToolInputDetail(msg);
        logger.info(`[${toolName}] ${detail ?? ""}`);
        if (["Read", "Grep", "Glob"].includes(toolName)) {
          turn.currentStatus = "locating";
          turn.onStatus(turn.currentStatus, detail ? `Reading ${detail}` : "Reading files...");
        } else if (["Edit", "Write", "MultiEdit"].includes(toolName)) {
          turn.currentStatus = "applying";
          turn.onStatus(turn.currentStatus, detail ? `Editing ${detail}` : "Applying changes...");
        } else if (toolName === "Bash") {
          turn.onStatus(turn.currentStatus, detail ? `Running: ${detail}` : "Running command...");
        }
      }
      return;
    }

    if (msg.type !== "result") return;

    if (msg.subtype === "success") {
      turn.resultText = msg.result;
      const filesModified = extractModifiedFiles(msg.result);
      logger.info(`[${this.conversationId.slice(0, 8)}] Turn complete`);
      if (filesModified.length) {
        logger.info(`Modified files: ${filesModified.join(", ")}`);
      } else if (extractPlanBlock(msg.result)) {
        logger.info("Plan produced; awaiting user approval");
      }
      const finalText = turn.resultText || turn.fullText;
      const plan = filesModified.length === 0 ? extractPlanBlock(finalText) ?? undefined : undefined;
      const { changes, notes } = extractSummaryParts(finalText);
      this.finishTurn({
        success: true,
        resultText: finalText,
        filesModified,
        summary: changes,
        notes,
        plan,
      });
      return;
    }

    const errDetail = (msg as { error?: string }).error ?? "unknown";
    logger.error(`[${this.conversationId.slice(0, 8)}] Claude returned error: ${errDetail}`);
    this.finishTurn({
      success: false,
      error: `Claude Code error: ${errDetail}`,
      resultText: turn.fullText,
    });
  }

  private finishTurn(result: RunResult): void {
    const turn = this.activeTurn;
    if (!turn) return;
    this.activeTurn = null;
    if (turn.timeoutHandle) clearTimeout(turn.timeoutHandle);
    turn.resolve(result);
  }
}
