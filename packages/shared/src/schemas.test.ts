import { describe, test, expect } from "bun:test";
import {
  MessageSchema,
  ConnectionStatusSchema,
  ElementSelectionSchema,
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

describe("ElementSelectionSchema", () => {
  const baseSelection = {
    type: "element_selection",
    tagName: "button",
    className: "btn",
    xpath: "/html/body/div/button",
    boundingRect: { x: 10, y: 20, width: 100, height: 50 },
  };

  test("accepts payload with devicePixelRatio and computedStyles", () => {
    const msg = {
      ...baseSelection,
      devicePixelRatio: 2,
      computedStyles: { "font-size": "16px", "color": "rgb(0, 0, 0)" },
    };
    const result = ElementSelectionSchema.safeParse(msg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.devicePixelRatio).toBe(2);
    }
  });

  test("defaults devicePixelRatio to 1 when omitted", () => {
    const result = ElementSelectionSchema.safeParse(baseSelection);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.devicePixelRatio).toBe(1);
    }
  });
});

describe("ChangeRequestSchema new fields", () => {
  test("accepts payload with boundingRect, computedStyles, sourceColumn", () => {
    const msg = {
      type: "change_request",
      description: "Make it red",
      elementXpath: "/html/body/div/button",
      boundingRect: { x: 10, y: 20, width: 100, height: 50 },
      computedStyles: { "color": "red" },
      sourceColumn: 5,
    };
    expect(ChangeRequestSchema.safeParse(msg).success).toBe(true);
  });

  test("still validates without new optional fields (backward compat)", () => {
    const msg = {
      type: "change_request",
      description: "Change color",
      elementXpath: "/html/body/div",
    };
    expect(ChangeRequestSchema.safeParse(msg).success).toBe(true);
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
