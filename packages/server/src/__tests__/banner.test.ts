import { test, expect, beforeEach, afterEach } from "bun:test";
import { renderBanner } from "../banner";

const ORIGINAL = {
  NO_COLOR: process.env.NO_COLOR,
  FORCE_COLOR: process.env.FORCE_COLOR,
  COLORTERM: process.env.COLORTERM,
};

beforeEach(() => {
  // Force plain output regardless of how bun test was invoked, so the
  // rendered banner is deterministic across local dev and CI.
  process.env.NO_COLOR = "1";
  delete process.env.FORCE_COLOR;
  delete process.env.COLORTERM;
});

afterEach(() => {
  if (ORIGINAL.NO_COLOR === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = ORIGINAL.NO_COLOR;
  if (ORIGINAL.FORCE_COLOR === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = ORIGINAL.FORCE_COLOR;
  if (ORIGINAL.COLORTERM === undefined) delete process.env.COLORTERM;
  else process.env.COLORTERM = ORIGINAL.COLORTERM;
});

test("renders three aligned lines with a single-cell left bar", () => {
  const out = renderBanner({
    version: "0.0.1",
    port: 9377,
    scope: "auto-resolve under /Users/you",
  });

  const lines = out.split("\n");
  // 3 content lines + trailing blank line added by renderBanner.
  expect(lines).toHaveLength(4);
  expect(lines[3]).toBe("");

  // Every content line must begin with the ASCII fallback bar + single space
  // in NO_COLOR mode. This guarantees the content column is always index 2.
  for (const line of lines.slice(0, 3)) {
    expect(line.startsWith("| ")).toBe(true);
  }

  expect(lines[0]).toContain("INSPATCH");
  expect(lines[0]).toContain("v0.0.1");
  expect(lines[1]).toContain("ws://127.0.0.1:9377");
  // Editor info is printed separately after the banner, not inside it.
  expect(lines[1]).not.toContain("cursor");
  expect(lines[2]).toContain("auto-resolve under /Users/you");
});

test("contains no wide / ambiguous-width glyphs", () => {
  const out = renderBanner({
    version: "1.2.3",
    port: 1234,
    scope: "scope",
  });

  // Characters that have bitten us before (U+271B crosshair, box-drawing).
  const wide = /[\u2500-\u257F\u2700-\u27BF]/;
  expect(wide.test(out)).toBe(false);
});
