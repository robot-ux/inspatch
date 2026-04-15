import { z } from "zod";

export const ConnectionStatusSchema = z.object({
  type: z.literal("connection_status"),
  connected: z.boolean(),
  serverVersion: z.string().optional(),
});

export const BoundingRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const ElementSelectionSchema = z.object({
  type: z.literal("element_selection"),
  tagName: z.string(),
  className: z.string(),
  id: z.string().optional(),
  xpath: z.string(),
  boundingRect: BoundingRectSchema,
  componentName: z.string().optional(),
  parentChain: z.array(z.string()).optional(),
  sourceFile: z.string().optional(),
  sourceLine: z.number().optional(),
  sourceColumn: z.number().optional(),
  devicePixelRatio: z.number().default(1),
  computedStyles: z.record(z.string(), z.string()).optional(),
});

export const ConsoleErrorSchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
  timestamp: z.number(),
});

export const ChangeRequestSchema = z.object({
  type: z.literal("change_request"),
  requestId: z.string().optional(),
  description: z.string().min(1),
  elementXpath: z.string(),
  componentName: z.string().optional(),
  parentChain: z.array(z.string()).optional(),
  sourceFile: z.string().optional(),
  sourceLine: z.number().optional(),
  sourceColumn: z.number().optional(),
  screenshotDataUrl: z.string().optional(),
  boundingRect: BoundingRectSchema.optional(),
  computedStyles: z.record(z.string(), z.string()).optional(),
  consoleErrors: z.array(ConsoleErrorSchema).optional(),
});

export const StatusUpdateSchema = z.object({
  type: z.literal("status_update"),
  requestId: z.string().optional(),
  status: z.enum(["queued", "analyzing", "locating", "generating", "applying", "complete", "error"]),
  message: z.string(),
  progress: z.number().min(0).max(100).optional(),
  streamText: z.string().optional(),
});

export const ChangeResultSchema = z.object({
  type: z.literal("change_result"),
  requestId: z.string().optional(),
  success: z.boolean(),
  diff: z.string().optional(),
  filesModified: z.array(z.string()).optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
});

export const InspectCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start-inspect") }),
  z.object({ type: z.literal("stop-inspect") }),
]);

export type InspectCommand = z.infer<typeof InspectCommandSchema>;

export const ResumeRequestSchema = z.object({
  type: z.literal("resume"),
  requestId: z.string(),
});

export const ResumeNotFoundSchema = z.object({
  type: z.literal("resume_not_found"),
  requestId: z.string(),
});

export const MessageSchema = z.discriminatedUnion("type", [
  ConnectionStatusSchema,
  ElementSelectionSchema,
  ChangeRequestSchema,
  StatusUpdateSchema,
  ChangeResultSchema,
  ResumeRequestSchema,
  ResumeNotFoundSchema,
]);

export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;
export type ElementSelection = z.infer<typeof ElementSelectionSchema>;
export type ConsoleError = z.infer<typeof ConsoleErrorSchema>;
export type ChangeRequest = z.infer<typeof ChangeRequestSchema>;
export type StatusUpdate = z.infer<typeof StatusUpdateSchema>;
export type ChangeResult = z.infer<typeof ChangeResultSchema>;
export type ResumeRequest = z.infer<typeof ResumeRequestSchema>;
export type ResumeNotFound = z.infer<typeof ResumeNotFoundSchema>;
export type Message = z.infer<typeof MessageSchema>;

export const PingSchema = z.object({ type: z.literal("ping") });
export const PongSchema = z.object({ type: z.literal("pong") });
export const PingPongSchema = z.discriminatedUnion("type", [PingSchema, PongSchema]);
export type PingPong = z.infer<typeof PingPongSchema>;

export function parseMessage(data: unknown) {
  return MessageSchema.safeParse(data);
}

export function parseProtocolMessage(data: unknown) {
  const pingPong = PingPongSchema.safeParse(data);
  if (pingPong.success) return pingPong;
  return MessageSchema.safeParse(data);
}
