// Pool of long-lived per-conversation Claude subprocesses.
//
// One TabAgent per conversationId. The pool lazily creates an agent on the
// first turn, evicts the least-recently-used one when the cap is reached,
// and periodically sweeps idle agents so forgotten tabs don't leak Claude
// subprocesses.

import { createLogger } from "@inspatch/shared";
import { TabAgent } from "./tab-agent";

const logger = createLogger("pool");

// Keep at most N live Claude sessions. Each one owns a Claude CLI subprocess
// (~100+ MB RSS), so 8 is a comfortable cap for a dev laptop.
const DEFAULT_MAX_AGENTS = 8;
// Close a session that hasn't seen a turn in this long.
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
// Interval between idle sweeps.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export interface TabAgentPoolOptions {
  maxAgents?: number;
  idleTimeoutMs?: number;
  // Override for tests; pass `null` to disable the background sweeper.
  sweepIntervalMs?: number | null;
}

export class TabAgentPool {
  private readonly agents = new Map<string, TabAgent>();
  private readonly maxAgents: number;
  private readonly idleTimeoutMs: number;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(options: TabAgentPoolOptions = {}) {
    this.maxAgents = options.maxAgents ?? DEFAULT_MAX_AGENTS;
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

    const interval = options.sweepIntervalMs ?? SWEEP_INTERVAL_MS;
    if (interval !== null) {
      this.sweepTimer = setInterval(() => this.sweepIdle(), interval);
      // Don't keep the event loop alive just for the sweep timer.
      this.sweepTimer.unref?.();
    }
  }

  // Returns the TabAgent for `conversationId`, creating one on first use.
  // If the stored agent's projectDir differs from the new one (rare — the
  // user changed the inspected project under the same conversation), the
  // old agent is closed and a fresh one takes its place.
  get(conversationId: string, projectDir: string): TabAgent {
    if (this.closed) {
      throw new Error("TabAgentPool has been closed");
    }

    const existing = this.agents.get(conversationId);
    if (existing) {
      if (existing.projectDir !== projectDir) {
        logger.info(
          `Project changed for conversation ${conversationId.slice(0, 8)}: ${existing.projectDir} → ${projectDir}; rebuilding session`,
        );
        existing.close();
        this.agents.delete(conversationId);
      } else {
        // Refresh LRU position.
        this.agents.delete(conversationId);
        this.agents.set(conversationId, existing);
        return existing;
      }
    }

    this.evictIfNeeded();
    const agent = new TabAgent(conversationId, projectDir);
    this.agents.set(conversationId, agent);
    logger.info(
      `New session ${conversationId.slice(0, 8)} in ${projectDir} (live=${this.agents.size})`,
    );
    return agent;
  }

  // Explicit close — called when a tab sends a fresh conversationId or
  // clicks "New conversation". Safe to call for an unknown conversationId.
  close(conversationId: string): void {
    const agent = this.agents.get(conversationId);
    if (!agent) return;
    agent.close();
    this.agents.delete(conversationId);
    logger.info(`Closed session ${conversationId.slice(0, 8)} (live=${this.agents.size})`);
  }

  // Tear down every live session. Called on server shutdown.
  closeAll(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    const count = this.agents.size;
    for (const agent of this.agents.values()) {
      try {
        agent.close();
      } catch {
        /* best-effort */
      }
    }
    this.agents.clear();
    if (count > 0) {
      logger.info(`Closed all sessions (count=${count})`);
    }
  }

  get size(): number {
    return this.agents.size;
  }

  has(conversationId: string): boolean {
    return this.agents.has(conversationId);
  }

  // Visible for testing.
  sweepIdle(): void {
    if (this.closed) return;
    const cutoff = Date.now() - this.idleTimeoutMs;
    for (const [id, agent] of this.agents) {
      if (!agent.isActive && agent.lastActive < cutoff) {
        logger.info(`Idle-sweep: closing session ${id.slice(0, 8)}`);
        agent.close();
        this.agents.delete(id);
      }
    }
  }

  private evictIfNeeded(): void {
    if (this.agents.size < this.maxAgents) return;
    // Find the least-recently-active non-busy agent. If none are idle, fall
    // back to the Map's insertion-order head (JS guarantees this is the
    // oldest entry by insertion, and we refresh on `get` so it's effectively
    // LRU).
    let victim: [string, TabAgent] | null = null;
    for (const entry of this.agents) {
      if (entry[1].isActive) continue;
      victim = entry;
      break;
    }
    if (!victim) {
      // Every agent is mid-turn — evict the oldest anyway; the turn will
      // resolve with an "unexpectedly ended" error.
      const first = this.agents.entries().next();
      if (first.done) return;
      victim = first.value as [string, TabAgent];
    }
    logger.info(`LRU-evict: closing session ${victim[0].slice(0, 8)}`);
    victim[1].close();
    this.agents.delete(victim[0]);
  }
}
