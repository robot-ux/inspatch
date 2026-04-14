import { describe, test, expect } from "bun:test";
import {
  MessageSchema,
  ConnectionStatusSchema,
  ChangeRequestSchema,
  parseMessage,
} from "./schemas";

describe("ConnectionStatusSchema", () => {
  test("accepts valid connection_status message", () => {
    const msg = { type: "connection_status", connected: true, serverVersion: "1.0.0" };
    expect(ConnectionStatusSchema.safeParse(msg).success).toBe(true);
  });

  test("accepts connection_status without optional serverVersion", () => {
    const msg = { type: "connection_status", connected: false };
    expect(ConnectionStatusSchema.safeParse(msg).success).toBe(true);
  });
});

describe("MessageSchema discriminated union", () => {
  test("routes connection_status correctly", () => {
    const msg = { type: "connection_status", connected: true };
    expect(MessageSchema.safeParse(msg).success).toBe(true);
  });

  test("routes change_request correctly", () => {
    const msg = {
      type: "change_request",
      description: "Make the button red",
      elementXpath: "/html/body/div/button",
    };
    expect(MessageSchema.safeParse(msg).success).toBe(true);
  });

  test("rejects message with missing type field", () => {
    const msg = { connected: true };
    expect(MessageSchema.safeParse(msg).success).toBe(false);
  });

  test("rejects message with unknown type value", () => {
    const msg = { type: "unknown_type", data: "test" };
    expect(MessageSchema.safeParse(msg).success).toBe(false);
  });
});

describe("parseMessage", () => {
  test("returns success for valid input", () => {
    const result = parseMessage({ type: "status_update", status: "analyzing", message: "Starting" });
    expect(result.success).toBe(true);
  });

  test("returns failure for invalid input", () => {
    const result = parseMessage({ garbage: true });
    expect(result.success).toBe(false);
  });
});
