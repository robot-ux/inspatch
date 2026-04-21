import { describe, expect, test } from "bun:test";
import { TabAgentPool } from "../tab-agent-pool";

// We never spawn a real Claude subprocess in these tests — `TabAgent.ensureQuery`
// is only called inside `sendTurn`, which the pool tests don't exercise. The
// pool only interacts with the public `TabAgent` surface (projectDir, close,
// isActive, lastActive), so wiring up the real class is safe and faithful.

describe("TabAgentPool", () => {
  test("lazily creates a TabAgent for a new conversationId", () => {
    const pool = new TabAgentPool({ sweepIntervalMs: null });
    const agent = pool.get("11111111-1111-4111-8111-111111111111", "/tmp/proj-a");
    expect(agent.conversationId).toBe("11111111-1111-4111-8111-111111111111");
    expect(agent.projectDir).toBe("/tmp/proj-a");
    expect(pool.size).toBe(1);
    pool.closeAll();
  });

  test("reuses the same agent for repeated gets with the same id+projectDir", () => {
    const pool = new TabAgentPool({ sweepIntervalMs: null });
    const first = pool.get("c1", "/tmp/p");
    const second = pool.get("c1", "/tmp/p");
    expect(first).toBe(second);
    expect(pool.size).toBe(1);
    pool.closeAll();
  });

  test("rebuilds the agent when projectDir changes for the same conversationId", () => {
    const pool = new TabAgentPool({ sweepIntervalMs: null });
    const first = pool.get("c1", "/tmp/p1");
    const second = pool.get("c1", "/tmp/p2");
    expect(first).not.toBe(second);
    expect(second.projectDir).toBe("/tmp/p2");
    expect(pool.size).toBe(1);
    pool.closeAll();
  });

  test("evicts the least-recently-used agent when cap is hit", () => {
    const pool = new TabAgentPool({ maxAgents: 2, sweepIntervalMs: null });
    pool.get("a", "/tmp/a");
    pool.get("b", "/tmp/b");
    // Touch "a" so "b" becomes the LRU victim.
    pool.get("a", "/tmp/a");
    pool.get("c", "/tmp/c");
    expect(pool.has("a")).toBe(true);
    expect(pool.has("b")).toBe(false);
    expect(pool.has("c")).toBe(true);
    pool.closeAll();
  });

  test("close(id) removes only that agent", () => {
    const pool = new TabAgentPool({ sweepIntervalMs: null });
    pool.get("a", "/tmp/a");
    pool.get("b", "/tmp/b");
    pool.close("a");
    expect(pool.has("a")).toBe(false);
    expect(pool.has("b")).toBe(true);
    pool.closeAll();
  });

  test("closeAll() drops every agent and blocks further get()", () => {
    const pool = new TabAgentPool({ sweepIntervalMs: null });
    pool.get("a", "/tmp/a");
    pool.get("b", "/tmp/b");
    pool.closeAll();
    expect(pool.size).toBe(0);
    expect(() => pool.get("c", "/tmp/c")).toThrow(/closed/i);
  });

  test("sweepIdle() removes agents past the idle threshold", async () => {
    const pool = new TabAgentPool({ idleTimeoutMs: 5, sweepIntervalMs: null });
    pool.get("a", "/tmp/a");
    await new Promise((r) => setTimeout(r, 15));
    pool.sweepIdle();
    expect(pool.has("a")).toBe(false);
    pool.closeAll();
  });

  test("sweepIdle() keeps active (mid-turn) agents", () => {
    const pool = new TabAgentPool({ idleTimeoutMs: 1, sweepIntervalMs: null });
    const agent = pool.get("a", "/tmp/a");
    // Simulate a turn in flight by flipping the private state directly.
    (agent as unknown as { activeTurn: unknown }).activeTurn = { fake: true };
    pool.sweepIdle();
    expect(pool.has("a")).toBe(true);
    // Clean up so close() doesn't try to teardown an active turn with a
    // missing `resolve` closure.
    (agent as unknown as { activeTurn: unknown }).activeTurn = null;
    pool.closeAll();
  });
});
