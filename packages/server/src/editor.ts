import { join } from "node:path";
import { existsSync } from "node:fs";
import { createLogger } from "@inspatch/shared";

const logger = createLogger("editor");

export type EditorScheme = "cursor" | "vscode";

async function isProcessRunning(name: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["pgrep", "-x", name], { stdout: "ignore", stderr: "ignore" });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

export async function detectEditor(): Promise<EditorScheme> {
  // Prefer whichever editor the user currently has open
  if (await isProcessRunning("Cursor")) { logger.info("Auto-detected editor: cursor (process running)"); return "cursor"; }
  if (await isProcessRunning("Code")) { logger.info("Auto-detected editor: vscode (process running)"); return "vscode"; }

  // Fall back to what's installed
  if (existsSync("/Applications/Cursor.app")) { logger.info("Auto-detected editor: cursor (app installed)"); return "cursor"; }
  if (existsSync("/Applications/Visual Studio Code.app")) { logger.info("Auto-detected editor: vscode (app installed)"); return "vscode"; }

  logger.info("Auto-detected editor: cursor (default)");
  return "cursor";
}

export async function openInEditor(url: URL, projectDir: string, configuredEditor: EditorScheme): Promise<Response> {
  const file = url.searchParams.get("file");
  const line = url.searchParams.get("line") ?? "1";
  const col = url.searchParams.get("column") ?? "0";
  // Extension sends its user preference — takes precedence over server startup config
  const editorParam = url.searchParams.get("editor");
  const editor = (editorParam === "cursor" || editorParam === "vscode") ? editorParam : configuredEditor;

  if (!file) {
    logger.error("open-in-editor: missing file param");
    return Response.json({ error: "missing file" }, { status: 400 });
  }

  const abs = file.startsWith("/") ? file : join(projectDir, file);
  const uri = `${editor}://file${abs}:${line}:${col}`;
  // Use the OS URL handler — works for VS Code and Cursor regardless of PATH
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  logger.info(`Opening in editor: ${uri}`);

  try {
    const proc = Bun.spawn([opener, uri], { stdout: "pipe", stderr: "pipe" });
    const [stderr] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (proc.exitCode !== 0) {
      logger.error(`${opener} exited ${proc.exitCode}: ${stderr.trim()}`);
      return Response.json({ error: stderr.trim() || "editor launch failed" }, { status: 500 });
    }
    logger.info("Editor opened successfully");
    return Response.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to spawn ${opener}: ${msg}`);
    return Response.json({ error: msg }, { status: 500 });
  }
}
