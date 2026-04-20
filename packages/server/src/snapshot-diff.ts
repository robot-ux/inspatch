import { mkdtemp, readFile, writeFile, mkdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, relative, resolve } from "path";
import { createLogger } from "@inspatch/shared";

const logger = createLogger("snapshot-diff");

const MAX_SNAPSHOT_FILE_BYTES = 2 * 1024 * 1024;

// Narrow snapshot to plain text source files a user might hand-edit.
// Anything else (binaries, images, archives) is skipped — we never snapshot
// node_modules-scale trees.
const TEXT_EXTENSIONS = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
  ".json", ".svg", ".md", ".txt",
]);

/**
 * Detect whether `projectDir` is inside a Git working tree. When true, the
 * caller should prefer `git diff`; when false, use snapshotProject + computeSnapshotDiff.
 */
export async function isGitRepo(projectDir: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--is-inside-work-tree"], {
      cwd: projectDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = (await new Response(proc.stdout).text()).trim();
    await proc.exited;
    return output === "true";
  } catch {
    return false;
  }
}

function hasTextExtension(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return false;
  return TEXT_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

/**
 * Walk `projectDir` and copy every tracked text file into a fresh temp dir,
 * returning the path to that snapshot root. Used to capture "before" state in
 * non-Git projects so we can diff against it after Claude finishes.
 */
export async function snapshotProject(projectDir: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "inspatch-snap-"));
  const absProject = resolve(projectDir);

  const glob = new Bun.Glob("**/*");
  for await (const entry of glob.scan({
    cwd: absProject,
    onlyFiles: true,
    dot: false,
  })) {
    if (!hasTextExtension(entry)) continue;

    // Bun.Glob doesn't expose a gitignore-style skip; do it manually.
    if (entry.includes("node_modules/") || entry.includes(".git/")) continue;
    if (entry.startsWith(".next/") || entry.startsWith("dist/") || entry.startsWith("build/") || entry.startsWith("out/")) continue;

    const absSource = join(absProject, entry);
    try {
      const st = await stat(absSource);
      if (!st.isFile() || st.size > MAX_SNAPSHOT_FILE_BYTES) continue;
      const content = await readFile(absSource);
      const dest = join(root, entry);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, content);
    } catch (err) {
      logger.debug(`Skipping ${entry} during snapshot:`, err);
    }
  }

  return root;
}

/**
 * Produce a unified diff comparing pre-run snapshot vs. current project state
 * for the given list of modified files. Each file is diffed via
 * `git diff --no-index`, which works outside of Git repos.
 *
 * `modifiedFiles` may be relative or absolute — anything outside `projectDir`
 * is skipped for safety (prevents escape from the project root).
 */
export async function computeSnapshotDiff(
  projectDir: string,
  snapshotDir: string,
  modifiedFiles: string[],
): Promise<string | null> {
  const absProject = resolve(projectDir);
  const chunks: string[] = [];

  for (const file of modifiedFiles) {
    const absFile = resolve(absProject, file);
    const relPath = relative(absProject, absFile);
    if (relPath.startsWith("..") || absFile === absProject) continue;

    const before = join(snapshotDir, relPath);
    const after = absFile;

    const beforeExists = existsSync(before);
    const afterExists = existsSync(after);
    if (!beforeExists && !afterExists) continue;

    const diff = await runGitDiffNoIndex(
      beforeExists ? before : "/dev/null",
      afterExists ? after : "/dev/null",
      relPath,
    );
    if (diff) chunks.push(diff);
  }

  const combined = chunks.join("\n").trim();
  return combined || null;
}

async function runGitDiffNoIndex(before: string, after: string, label: string): Promise<string> {
  try {
    const proc = Bun.spawn(
      ["git", "diff", "--no-index", "--no-color", "--", before, after],
      { stdout: "pipe", stderr: "pipe" },
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return rewriteDiffHeaders(output, label);
  } catch (err) {
    logger.debug(`git diff --no-index failed for ${label}:`, err);
    return "";
  }
}

/**
 * Rewrite the `diff --git a/<tmpPath> b/<projectPath>` header so both sides
 * show the relative path inside the project. Without this the output would
 * leak the temp-snapshot location, which is confusing in the UI.
 */
function rewriteDiffHeaders(diff: string, relPath: string): string {
  if (!diff) return diff;
  const lines = diff.split("\n");
  const out = lines.map((line) => {
    if (line.startsWith("diff --git ")) {
      return `diff --git a/${relPath} b/${relPath}`;
    }
    if (line.startsWith("--- ")) {
      return line.startsWith("--- /dev/null") ? "--- /dev/null" : `--- a/${relPath}`;
    }
    if (line.startsWith("+++ ")) {
      return line.startsWith("+++ /dev/null") ? "+++ /dev/null" : `+++ b/${relPath}`;
    }
    return line;
  });
  return out.join("\n");
}

/**
 * Best-effort cleanup. Failure is non-fatal — the OS will eventually GC the
 * temp directory itself.
 */
export async function cleanupSnapshot(snapshotDir: string): Promise<void> {
  try {
    await Bun.spawn(["rm", "-rf", snapshotDir]).exited;
  } catch {
    // ignore
  }
}
