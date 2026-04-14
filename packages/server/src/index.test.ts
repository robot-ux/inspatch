import { test, expect } from "bun:test";
import { MessageSchema, parseMessage } from "@inspatch/shared";

test("shared schema is importable from server package", () => {
  expect(MessageSchema).toBeDefined();
});

test("parseMessage works from server package", () => {
  const result = parseMessage({ type: "connection_status", connected: true });
  expect(result.success).toBe(true);
});
