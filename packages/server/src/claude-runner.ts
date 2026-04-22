// Shared helpers for TabAgent / TabAgentPool. No `runClaude` entry point any
// more — per-tab long-lived Query lives in `tab-agent.ts`, which imports the
// pure helpers (prompt building, SDK message parsing, result extraction,
// git diff) from here.

import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ChangeRequest } from "@inspatch/shared";

export interface StatusCallback {
  (status: string, message: string, streamText?: string): void;
}

export interface RunResult {
  success: boolean;
  // When the turn ended with a plan (either discuss mode or quick-mode auto-
  // escalation), `plan` holds the extracted `## Plan` text and no files were
  // modified on this turn.
  plan?: string;
  resultText?: string;
  filesModified?: string[];
  // Headline describing what visually/behaviorally changed. Parsed from the
  // mandatory `**Changes:**` line in the Summary block.
  summary?: string;
  // Caveats / risks / follow-ups. Parsed from `**Notes:**`. `—` collapses to
  // undefined so the UI can hide the row when there's nothing to flag.
  notes?: string;
  error?: string;
}

// Plan-block extractor. Returns the `## Plan` section (without heading) if present.
export function extractPlanBlock(text: string): string | null {
  const match = text.match(/##\s*Plan\b\s*\n([\s\S]+?)(?:\n##\s|\n---|\s*$)/);
  return match ? match[1].trim() : null;
}

export function buildPromptText(req: ChangeRequest): string {
  const isFile = req.pageSource === "file";

  const lines: string[] = [
    isFile
      ? "You are modifying a local HTML file opened directly in the browser via file://. The user selected an element on the page and wants to make a change."
      : "You are modifying a web application. The user selected an element on the page and wants to make a change.",
    "",
    "## Selected Element",
    `- XPath: ${req.elementXpath}`,
  ];

  if (isFile && req.filePath) {
    lines.push(`- HTML file: \`${req.filePath}\``);
  }

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

  if (req.ancestors?.length) {
    const chain = req.ancestors
      .map((a) => {
        if (a.componentName) return `<${a.componentName}>`;
        const idPart = a.id ? `#${a.id}` : "";
        return `<${a.tagName}>${idPart}`;
      })
      .join(" > ");
    lines.push(`- Parent chain: ${chain}`);
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

  lines.push("", "## Instructions");

  if (isFile) {
    // DOM-only mode: no React, no sourcemaps. Claude locates the element by
    // matching the XPath / classes / tag inside the HTML file, then edits the
    // inline <style>, an imported CSS file, or the element's attributes.
    const target = req.filePath ?? "the HTML file in the project";
    lines.push(
      `1. Open \`${target}\` first; that is the entry point the user is viewing`,
      "2. Locate the element in the HTML by matching the XPath, tag name, id, and class list above",
      "3. Apply the change by editing the HTML, inline `<style>` tags, or any CSS/JS files the page links to (all must live inside the project directory)",
      "4. Do not introduce build tools, bundlers, or frameworks — this file is meant to be opened directly in the browser",
      "5. Only modify what's needed — don't refactor unrelated code",
      "6. Fix any related console errors from the list above if present",
      "7. End your response with this exact block:",
    );
  } else {
    lines.push(
      "1. Find the source file and make the changes described by the user",
      "2. Only modify what's needed — don't refactor unrelated code",
      "3. If the source file path looks like a URL or relative to a dev server, search for it in the project",
      "4. Fix any related console errors from the list above if present",
      "5. End your response with this exact block:",
    );
  }

  lines.push(
    "",
    "## Summary",
    "**UI changes:** <what visually changed, or \"none\">",
    "**Errors fixed:** <which console errors were resolved, or \"none\">",
    "**Files modified:** `file1.tsx`, `file2.ts`",
  );

  return lines.join("\n");
}

// Builds a single SDKUserMessage from a change request, attaching the
// screenshot as an image part when one is present. Used by TabAgent to push
// turns into the long-lived Claude Query.
export function buildUserMessage(req: ChangeRequest): SDKUserMessage {
  const text = buildPromptText(req);

  if (!req.screenshotDataUrl) {
    return {
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
    } satisfies SDKUserMessage;
  }

  const dataUrlMatch = req.screenshotDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!dataUrlMatch) {
    return {
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
    } satisfies SDKUserMessage;
  }

  const [, mediaType, base64Data] = dataUrlMatch;

  return {
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

// Short natural-language nudge sent when the user approves a plan Claude
// proposed in the previous turn. The plan is NOT repeated here — Claude has
// it in conversation memory.
export function buildApprovalMessage(): SDKUserMessage {
  return {
    type: "user",
    message: {
      role: "user",
      content:
        "Approved. Please execute the plan you just proposed now, applying the edits directly. Do not re-plan.",
    },
    parent_tool_use_id: null,
  } satisfies SDKUserMessage;
}

export function extractTextFromMessage(msg: SDKMessage): string | null {
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

export function extractToolNameFromMessage(msg: SDKMessage): string | null {
  if (msg.type === "assistant") {
    const content = (msg.message as { content?: unknown[] })?.content;
    if (Array.isArray(content)) {
      const toolUse = content.find((b: unknown) => (b as { type: string }).type === "tool_use");
      if (toolUse) return (toolUse as { name: string }).name;
    }
  }
  return null;
}

export function extractToolInputDetail(msg: SDKMessage): string | null {
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

export function extractModifiedFiles(text: string): string[] {
  // Prefer the structured `**Files:**` line inside the Summary block.
  // Fall back to the legacy `**Files modified:**` header so mid-rollout
  // turns from old Claude output still parse.
  const filesLine = text.match(/\*\*Files(?:\s+modified)?:\*\*\s*(.+)/i);
  if (filesLine) {
    const files = [...filesLine[1].matchAll(/`([^`]+)`/g)]
      .map((m) => m[1])
      .filter((f) => f.includes(".") && !f.includes(" "));
    if (files.length) return files;
  }

  // Last-resort fallback: scan narrative for edit/write verbs. Keeps us
  // producing *some* file list when Claude skips the Summary block entirely.
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

// Pulls the named `**Label:**` value out of the Summary block. Returns
// undefined when the block is missing, the label is missing, or the value
// is the sentinel `—` / `-` / `none` (case-insensitive) that Claude uses
// to mean "nothing to say here".
function extractSummaryField(block: string, label: string): string | undefined {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]+?)(?=\\n\\*\\*\\w|$)`, "i");
  const match = block.match(re);
  if (!match) return undefined;
  const value = match[1].trim();
  if (!value) return undefined;
  if (/^(?:—|-|none|n\/a)$/i.test(value)) return undefined;
  return value;
}

export interface SummaryParts {
  changes?: string;
  notes?: string;
}

// Parses the Summary block emitted at the end of an edit turn. See
// prompts.ts for the expected shape: `**Changes:** ...` / `**Notes:** ...`.
// Falls back to scanning the whole message if Claude forgets the `## Summary`
// heading, and accepts the legacy `**UI changes:**` label from the old prompt
// so mid-rollout turns still surface a headline.
export function extractSummaryParts(text: string): SummaryParts {
  const block = text.match(/##\s*Summary\s*\n([\s\S]+?)(?:\n##\s|\n---|\n\n\n|$)/)?.[1] ?? text;
  return {
    changes: extractSummaryField(block, "Changes") ?? extractSummaryField(block, "UI changes"),
    notes: extractSummaryField(block, "Notes"),
  };
}

// Returns paths of files dirty in `projectDir`'s working tree, expressed
// relative to `projectDir` itself. The `--relative` flag is critical when
// `projectDir` is a subfolder of a larger git repo (monorepo case) — without
// it git returns repo-root-relative paths, which the caller would then
// incorrectly resolve against `projectDir`.
export async function getGitModifiedFiles(projectDir: string): Promise<string[]> {
  try {
    const proc = Bun.spawn(["git", "diff", "--name-only", "--relative"], {
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
