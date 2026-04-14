import { z } from "zod";

export const ConnectionStatusSchema = z.object({
  type: z.literal("connection_status"),
  connected: z.boolean(),
  serverVersion: z.string().optional(),
});

export const ElementSelectionSchema = z.object({
  type: z.literal("element_selection"),
  tagName: z.string(),
  className: z.string(),
  id: z.string().optional(),
  xpath: z.string(),
  boundingRect: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  componentName: z.string().optional(),
  sourceFile: z.string().optional(),
  sourceLine: z.number().optional(),
});

export const ChangeRequestSchema = z.object({
  type: z.literal("change_request"),
  description: z.string().min(1),
  elementXpath: z.string(),
  componentName: z.string().optional(),
  sourceFile: z.string().optional(),
  sourceLine: z.number().optional(),
  screenshotDataUrl: z.string().optional(),
});

export const StatusUpdateSchema = z.object({
  type: z.literal("status_update"),
  status: z.enum(["analyzing", "locating", "generating", "applying", "complete", "error"]),
  message: z.string(),
  progress: z.number().min(0).max(100).optional(),
});

export const ChangeResultSchema = z.object({
  type: z.literal("change_result"),
  success: z.boolean(),
  diff: z.string().optional(),
  filesModified: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export const MessageSchema = z.discriminatedUnion("type", [
  ConnectionStatusSchema,
  ElementSelectionSchema,
  ChangeRequestSchema,
  StatusUpdateSchema,
  ChangeResultSchema,
]);

export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;
export type ElementSelection = z.infer<typeof ElementSelectionSchema>;
export type ChangeRequest = z.infer<typeof ChangeRequestSchema>;
export type StatusUpdate = z.infer<typeof StatusUpdateSchema>;
export type ChangeResult = z.infer<typeof ChangeResultSchema>;
export type Message = z.infer<typeof MessageSchema>;

export function parseMessage(data: unknown) {
  return MessageSchema.safeParse(data);
}
