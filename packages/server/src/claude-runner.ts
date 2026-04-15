import { query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ChangeRequest } from "@inspatch/shared";
import { createLogger } from "@inspatch/shared";

const logger = createLogger("claude");

export interface StatusCallback {
  (status: string, message: string, streamText?: string): void;
}

export interface RunResult {
  success: boolean;
  resultText?: string;
  filesModified?: string[];
  summary?: string;
  error?: string;
}

function buildPromptText(req: ChangeRequest): string {
  const lines: string[] = [
    "You are modifying a web application. The user selected an element on the page and wants to make a change.",
    "",
    "## Selected Element",
    `- XPath: ${req.elementXpath}`,
  ];

  if (req.componentName) {
    let loc = `- Component: \`${req.componentName}\``;
    if (req.sourceFile) {
      loc += ` in \`${req.sourceFile}`;
      if (req.sourceLine) loc += `:${req.sourceLine}`;
      loc += "`";
    }
    lines.push(loc);
  } else if (req.sourceFile) {
    let loc = `- Source: \`${req.sourceFile}`;
    if (req.sourceLine) loc += `:${req.sourceLine}`;
    loc += "`";
    lines.push(loc);
  }

  if (req.parentChain?.length) {
    lines.push(`- Parent chain: ${req.parentChain.join(" > ")}`);
  }

  if (req.boundingRect) {
    const r = req.boundingRect;
    lines.push(`- Bounding rect: ${r.width}×${r.height} at (${r.x}, ${r.y})`);
  }

  if (req.computedStyles && Object.keys(req.computedStyles).length > 0) {
    const styleStr = Object.entries(req.computedStyles)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    lines.push(`- Key styles: ${styleStr}`);
  }

  lines.push("", "## User's Request", req.description);

  if (req.screenshotDataUrl) {
    lines.push("", "The user has also attached a screenshot of the element for visual reference.");
  }

  if (req.consoleErrors?.length) {
    lines.push("", "## Console Errors");
    lines.push("The following errors are currently in the browser console:");
    for (const err of req.consoleErrors) {
      lines.push(`- ${err.message}`);
      if (err.stack) {
        const trace = err.stack.split("\n").slice(1, 3).join(" | ").trim();
        if (trace) lines.push(`  ${trace}`);
      }
    }
    lines.push("", "Fix any of these errors that are related to the selected component or the user's request.");
  }

  lines.push(
    "",
    "## Instructions",
    "1. Find the source file and make the changes described by the user",
    "2. Only modify what's needed — don't refactor unrelated code",
    "3. If the source file path looks like a URL or relative to a dev server, search for it in the project",
    "4. Fix any related console errors from the list above if present",
    "5. End your response with this exact block:",
    "",
    "## Summary",
    "**UI changes:** <what visually changed, or \"none\">",
    "**Errors fixed:** <which console errors were resolved, or \"none\">",
    "**Files modified:** `file1.tsx`, `file2.ts`",
  );

  return lines.join("\n");
}

function buildPrompt(req: ChangeRequest): string | AsyncIterable<SDKUserMessage> {
  const text = buildPromptText(req);

  if (!req.screenshotDataUrl) {
    return text;
  }

  const dataUrlMatch = req.screenshotDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!dataUrlMatch) {
    return text;
  }

  const [, mediaType, base64Data] = dataUrlMatch;

  async function* generateMessages(): AsyncGenerator<SDKUserMessage> {
    yield {
      type: "user",
      message: {
        role: "user",
        content: [
          { type: "text", text },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
              data: base64Data,
            },
          },
        ],
      },
      parent_tool_use_id: null,
    } satisfies SDKUserMessage;
  }

  return generateMessages();
}

function extractTextFromMessage(msg: SDKMessage): string | null {
  if (msg.type === "assistant") {
    const content = (msg.message as { content?: unknown[] })?.content;
    if (Array.isArray(content)) {
      return content
        .filter((b: unknown) => (b as { type: string }).type === "text")
        .map((b: unknown) => (b as { text: string }).text)
        .join("");
    }
  }
  return null;
}

function extractToolNameFromMessage(msg: SDKMessage): string | null {
  if (msg.type === "assistant") {
    const content = (msg.message as { content?: unknown[] })?.content;
    if (Array.isArray(content)) {
      const toolUse = content.find((b: unknown) => (b as { type: string }).type === "tool_use");
      if (toolUse) return (toolUse as { name: string }).name;
    }
  }
  return null;
}

function extractToolInputDetail(msg: SDKMessage): string | null {
  if (msg.type !== "assistant") return null;
  const content = (msg.message as { content?: unknown[] })?.content;
  if (!Array.isArray(content)) return null;
  const toolUse = content.find((b: unknown) => (b as { type: string }).type === "tool_use");
  if (!toolUse) return null;
  const input = (toolUse as { input?: Record<string, unknown> }).input;
  if (!input) return null;
  if (typeof input.file_path === "string") {
    return input.file_path.split("/").slice(-2).join("/");
  }
  if (typeof input.pattern === "string") return `"${input.pattern}"`;
  if (typeof input.command === "string") return String(input.command).slice(0, 60);
  return null;
}

export async function runClaude(
  req: ChangeRequest,
  projectDir: string,
  onStatus: StatusCallback,
  signal?: AbortSignal,
  timeoutMs = 1_800_000,
): Promise<RunResult> {
  logger.info("Starting Claude Code SDK for:", req.description.slice(0, 100));
  logger.info(`Project dir: ${projectDir}`);
  if (req.sourceFile) logger.info(`Source: ${req.sourceFile}${req.sourceLine ? `:${req.sourceLine}` : ""}`);
  if (req.componentName) logger.info(`Component: ${req.componentName}`);
  if (req.screenshotDataUrl) logger.info("Screenshot attached");

  onStatus("analyzing", "Starting Claude Code...");

  const abortController = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => abortController.abort(), { once: true });
  }

  const timeout = setTimeout(() => {
    logger.warn(`Timeout reached (${timeoutMs / 1000}s), aborting`);
    abortController.abort();
  }, timeoutMs);

  let fullText = "";
  let currentStatus = "analyzing";
  let resultText = "";
  let filesModified: string[] = [];

  try {
    const prompt = buildPrompt(req);

    const q = query({
      prompt,
      options: {
        cwd: projectDir,
        allowedTools: ["Read", "Edit", "Write", "MultiEdit", "Bash", "Grep", "Glob"],
        abortController,
        permissionMode: "acceptEdits",
      },
    });

    for await (const msg of q) {
      logger.debug("SDK event:", msg.type, msg.type === "result" ? (msg as { subtype?: string }).subtype : "");

      if (msg.type === "assistant") {
        const text = extractTextFromMessage(msg);
        if (text) {
          fullText = text;
          onStatus(currentStatus, "Claude is working...", text);
        }

        const toolName = extractToolNameFromMessage(msg);
        if (toolName) {
          const detail = extractToolInputDetail(msg);
          logger.info(`[${toolName}] ${detail ?? ""}`);
          if (["Read", "Grep", "Glob"].includes(toolName)) {
            currentStatus = "locating";
            onStatus(currentStatus, detail ? `Reading ${detail}` : "Reading files...");
          } else if (["Edit", "Write", "MultiEdit"].includes(toolName)) {
            currentStatus = "applying";
            onStatus(currentStatus, detail ? `Editing ${detail}` : "Applying changes...");
          } else if (toolName === "Bash") {
            onStatus(currentStatus, detail ? `Running: ${detail}` : "Running command...");
          }
        }
      } else if (msg.type === "result") {
        if (msg.subtype === "success") {
          resultText = msg.result;
          filesModified = extractModifiedFiles(msg.result);
          logger.info("Claude completed successfully");
          if (filesModified.length) {
            logger.info(`Modified files: ${filesModified.join(", ")}`);
          }
        } else {
          const errDetail = (msg as { error?: string }).error ?? "unknown";
          logger.error("Claude returned error:", errDetail);
          clearTimeout(timeout);
          return {
            success: false,
            error: `Claude Code error: ${errDetail}`,
            resultText: fullText,
          };
        }
      }
    }
  } catch (err) {
    clearTimeout(timeout);
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    if (errMsg.includes("abort")) {
      return { success: false, error: "Request timed out or was cancelled" };
    }
    logger.error("SDK error:", errMsg);
    return { success: false, error: errMsg };
  }

  clearTimeout(timeout);

  const finalText = resultText || fullText;
  return {
    success: true,
    resultText: finalText,
    filesModified,
    summary: extractSummary(finalText),
  };
}

function extractModifiedFiles(text: string): string[] {
  // Try structured summary first
  const filesLine = text.match(/\*\*Files modified:\*\*\s*(.+)/i);
  if (filesLine) {
    const files = [...filesLine[1].matchAll(/`([^`]+)`/g)]
      .map(m => m[1])
      .filter(f => f.includes(".") && !f.includes(" "));
    if (files.length) return files;
  }

  // Fallback: scan for edit/write verbs
  const files = new Set<string>();
  const patterns = [
    /(?:edited|modified|updated|changed|wrote|created)\s+`([^`]+)`/gi,
    /(?:editing|modifying|updating|writing)\s+`([^`]+)`/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const file = match[1];
      if (file.includes(".") && !file.includes(" ")) {
        files.add(file);
      }
    }
  }
  return [...files];
}

function extractSummary(text: string): string | undefined {
  const match = text.match(/## Summary\n([\s\S]+?)(?:\n##\s|\n---|\n\n\n|$)/);
  return match?.[1].trim();
}

export async function getGitDiff(projectDir: string, files?: string[]): Promise<string | null> {
  try {
    const args = ["diff", "--stat", "--patch", "--no-color"];
    if (files?.length) args.push("--", ...files);
    const proc = Bun.spawn(["git", ...args], {
      cwd: projectDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output.trim() || null;
  } catch {
    return null;
  }
}

export async function getGitModifiedFiles(projectDir: string): Promise<string[]> {
  try {
    const proc = Bun.spawn(["git", "diff", "--name-only"], {
      cwd: projectDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
