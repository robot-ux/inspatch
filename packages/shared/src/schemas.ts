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

// "localhost" = React/localhost dev server page (fiber enrichment available).
// "file" = page loaded via file:// protocol (DOM-only; no fiber, no sourcemaps).
export const PageSourceSchema = z.enum(["localhost", "file"]);
export type PageSource = z.infer<typeof PageSourceSchema>;

// DOM ancestor captured at selection time. The Element-tree UI uses it to
// render a stable snapshot around the inspected anchor; the side panel lets
// the user "target" any row without rebuilding the tree, so each row carries
// its own React component / source info, populated from the fiber owning the
// DOM node. sourceFile/sourceLine come from `_debugSource` (dev builds only).
export const AncestorInfoSchema = z.object({
  xpath: z.string(),
  tagName: z.string(),
  id: z.string().optional(),
  classes: z.array(z.string()).optional(),
  componentName: z.string().optional(),
  sourceFile: z.string().optional(),
  sourceLine: z.number().optional(),
});
export type AncestorInfo = z.infer<typeof AncestorInfoSchema>;

// Direct or near descendants of the selected element (depth 1 or 2 in the
// DOM, capped to keep payloads small). `depth` is 1 for immediate children,
// 2 for grandchildren — used to render tree indentation.
export const DescendantInfoSchema = AncestorInfoSchema.extend({
  depth: z.number().int().min(1).max(4),
});
export type DescendantInfo = z.infer<typeof DescendantInfoSchema>;

export const ElementSelectionSchema = z.object({
  type: z.literal("element_selection"),
  tagName: z.string(),
  className: z.string(),
  id: z.string().optional(),
  xpath: z.string(),
  boundingRect: BoundingRectSchema,
  componentName: z.string().optional(),
  ancestors: z.array(AncestorInfoSchema).optional(),
  descendants: z.array(DescendantInfoSchema).optional(),
  sourceFile: z.string().optional(),
  sourceLine: z.number().optional(),
  sourceColumn: z.number().optional(),
  devicePixelRatio: z.number().default(1),
  computedStyles: z.record(z.string(), z.string()).optional(),
  // Defaults to "localhost" so existing clients behave unchanged.
  pageSource: PageSourceSchema.default("localhost"),
  // Absolute path of the HTML file when pageSource === "file"; unset otherwise.
  filePath: z.string().optional(),
});

export const ConsoleErrorSchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
  timestamp: z.number(),
});

// "quick"   = apply edits directly; auto-escalate to a plan only on risky changes.
// "discuss" = never edit; return a plan and wait for explicit approval.
export const ChangeModeSchema = z.enum(["quick", "discuss"]);
export type ChangeMode = z.infer<typeof ChangeModeSchema>;

export const ChangeRequestSchema = z.object({
  type: z.literal("change_request"),
  requestId: z.string().optional(),
  // Groups successive requests from the same tab into one Claude conversation.
  // Reset on page reload, URL change, or "New conversation" in the side panel.
  // Server uses this to route each turn into a long-lived per-tab Claude agent.
  conversationId: z.string().uuid(),
  description: z.string().min(1),
  elementXpath: z.string(),
  componentName: z.string().optional(),
  ancestors: z.array(AncestorInfoSchema).optional(),
  sourceFile: z.string().optional(),
  sourceLine: z.number().optional(),
  sourceColumn: z.number().optional(),
  screenshotDataUrl: z.string().optional(),
  boundingRect: BoundingRectSchema.optional(),
  computedStyles: z.record(z.string(), z.string()).optional(),
  consoleErrors: z.array(ConsoleErrorSchema).optional(),
  pageSource: PageSourceSchema.default("localhost"),
  filePath: z.string().optional(),
  mode: ChangeModeSchema.default("quick"),
});

// Server → extension. Sent when Claude produced a plan instead of an edit
// (either because mode was "discuss" or because quick-mode auto-escalated).
export const PlanProposalSchema = z.object({
  type: z.literal("plan_proposal"),
  requestId: z.string(),
  plan: z.string().min(1),
});

// Extension → server. User's decision on a previously-sent plan_proposal.
export const PlanApprovalSchema = z.object({
  type: z.literal("plan_approval"),
  requestId: z.string(),
  approve: z.boolean(),
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
  filesModified: z.array(z.string()).optional(),
  // Short headline describing what changed (from Claude's `**Changes:**` line).
  summary: z.string().optional(),
  // Caveats / follow-ups (from `**Notes:**`). Absent when Claude had nothing
  // to flag — the side panel hides the row in that case.
  notes: z.string().optional(),
  error: z.string().optional(),
});

export const InspectCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start-inspect") }),
  z.object({ type: z.literal("stop-inspect") }),
]);

export type InspectCommand = z.infer<typeof InspectCommandSchema>;

// Extension → server. Sent right after WS open and whenever the side panel
// becomes bound to a different browser tab, so the server can include the
// tab URL in its connection / queue logs.
export const IdentifySchema = z.object({
  type: z.literal("identify"),
  tabUrl: z.string(),
});

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
  PlanProposalSchema,
  PlanApprovalSchema,
  IdentifySchema,
]);

export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;
export type ElementSelection = z.infer<typeof ElementSelectionSchema>;
export type ConsoleError = z.infer<typeof ConsoleErrorSchema>;
export type ChangeRequest = z.infer<typeof ChangeRequestSchema>;
export type StatusUpdate = z.infer<typeof StatusUpdateSchema>;
export type ChangeResult = z.infer<typeof ChangeResultSchema>;
export type ResumeRequest = z.infer<typeof ResumeRequestSchema>;
export type ResumeNotFound = z.infer<typeof ResumeNotFoundSchema>;
export type PlanProposal = z.infer<typeof PlanProposalSchema>;
export type PlanApproval = z.infer<typeof PlanApprovalSchema>;
export type Identify = z.infer<typeof IdentifySchema>;
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
