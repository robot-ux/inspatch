import type { ChangeRequest } from "@inspatch/shared";
import { createLogger } from "@inspatch/shared";

const logger = createLogger("claude");

const CLI_TIMEOUT_MS = 120_000;

export interface StatusCallback {
  (status: string, message: string, streamText?: string): void;
}

export interface RunResult {
  success: boolean;
  resultText?: string;
  filesModified?: string[];
  error?: string;
}

function buildPrompt(req: ChangeRequest): string {
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

  lines.push(
    "",
    "## Instructions",
    "1. Find the source file and make the changes described by the user",
    "2. Only modify what's needed — don't refactor unrelated code",
    "3. If the source file path looks like a URL or relative to a dev server, search for it in the project",
    "4. After making changes, briefly describe what you changed",
  );

  return lines.join("\n");
}

function parseStreamLine(line: string): { type: string; text?: string; toolName?: string; result?: string } | null {
  if (!line.trim()) return null;

  try {
    const obj = JSON.parse(line);

    if (obj.type === "result") {
      return { type: "result", result: obj.result ?? "", text: obj.result };
    }

    if (obj.type === "stream_event") {
      const delta = obj.event?.delta;
      if (delta?.type === "text_delta" && delta.text) {
        return { type: "text", text: delta.text };
      }
      if (delta?.type === "input_json_delta") {
        return null;
      }

      const block = obj.event?.content_block;
      if (block?.type === "tool_use") {
        return { type: "tool_start", toolName: block.name };
      }
    }

    if (obj.type === "system" && obj.subtype === "api_retry") {
      return { type: "retry", text: `Retrying (attempt ${obj.attempt}/${obj.max_retries})...` };
    }

    return null;
  } catch {
    return null;
  }
}

export async function runClaude(
  req: ChangeRequest,
  projectDir: string,
  onStatus: StatusCallback,
  signal?: AbortSignal,
): Promise<RunResult> {
  const prompt = buildPrompt(req);
  logger.info("Starting Claude Code CLI");
  logger.debug("Prompt:", prompt.slice(0, 200) + "...");

  onStatus("analyzing", "Starting Claude Code...");

  const args = [
    "-p", prompt,
    "--output-format", "stream-json",
    "--bare",
    "--verbose",
    "--allowedTools", "Read,Edit,Bash",
  ];

  const proc = Bun.spawn(["claude", ...args], {
    cwd: projectDir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });

  if (!proc.stdout) {
    return { success: false, error: "Failed to capture CLI stdout" };
  }

  const timeoutId = setTimeout(() => {
    logger.warn("CLI timeout reached, killing process");
    proc.kill();
  }, CLI_TIMEOUT_MS);

  if (signal) {
    signal.addEventListener("abort", () => {
      proc.kill();
      clearTimeout(timeoutId);
    }, { once: true });
  }

  let fullText = "";
  let currentStatus = "analyzing";
  let resultText = "";
  const stdout = proc.stdout as ReadableStream<Uint8Array>;

  try {
    const reader = stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseStreamLine(line);
        if (!event) continue;

        if (event.type === "text") {
          fullText += event.text;
          onStatus(currentStatus, "Claude is working...", event.text);
        } else if (event.type === "tool_start") {
          const name = event.toolName ?? "";
          if (name === "Read" || name === "Grep" || name === "Glob") {
            currentStatus = "locating";
            onStatus(currentStatus, "Reading files...");
          } else if (name === "Edit" || name === "Write" || name === "MultiEdit") {
            currentStatus = "applying";
            onStatus(currentStatus, "Applying changes...");
          } else if (name === "Bash") {
            onStatus(currentStatus, "Running command...");
          }
        } else if (event.type === "result") {
          resultText = event.result ?? fullText;
        } else if (event.type === "retry") {
          onStatus(currentStatus, event.text ?? "Retrying...");
        }
      }
    }

    if (buffer.trim()) {
      const event = parseStreamLine(buffer);
      if (event?.type === "result") {
        resultText = event.result ?? fullText;
      }
    }
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : "Stream read error";
    logger.error(msg);
    return { success: false, error: msg };
  }

  clearTimeout(timeoutId);

  const exitCode = await proc.exited;
  logger.info(`CLI exited with code ${exitCode}`);

  if (exitCode !== 0) {
    const stderrStream = proc.stderr as ReadableStream<Uint8Array>;
    const stderr = await new Response(stderrStream).text();
    const errMsg = stderr.trim() || `CLI exited with code ${exitCode}`;
    logger.error(errMsg);
    return { success: false, error: errMsg, resultText: resultText || fullText };
  }

  const filesModified = extractModifiedFiles(resultText || fullText);

  return {
    success: true,
    resultText: resultText || fullText,
    filesModified,
  };
}

function extractModifiedFiles(text: string): string[] {
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
