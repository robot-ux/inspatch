// Derives the Claude `cwd` for a single change_request from the element's own
// source path. Keeps edits strictly scoped to the project the inspected
// element came from, and never lets them escape $HOME.
//
// Rules (see plan in CLAUDE.md discussion):
//   1. Pick anchor: filePath for file://, sourceFile otherwise.
//   2. Anchor must be an absolute filesystem path (no webpack:// / http:// etc).
//   3. realpath + check it is strictly under $HOME (symlink escape blocked).
//   4. Walk up looking for package.json, never crossing $HOME.
//   5. file:// with no package.json → use HTML file's parent directory.
//   6. localhost with no package.json → reject; Claude cannot run without a
//      project root.

import { existsSync, realpathSync } from "node:fs";
import { dirname, sep } from "node:path";
import { homedir } from "node:os";
import type { ChangeRequest } from "@inspatch/shared";

export type ResolveResult = { root: string } | { error: string };

function anchorSourceFromRequest(req: ChangeRequest): string | null {
  if (req.pageSource === "file") return req.filePath ?? null;
  return req.sourceFile ?? null;
}

function realpathSafe(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

function isStrictlyUnderHome(p: string, home: string): boolean {
  if (p === home) return false;
  return p.startsWith(home + sep);
}

export function resolveProjectRoot(req: ChangeRequest): ResolveResult {
  const source = anchorSourceFromRequest(req);
  if (!source) {
    return {
      error:
        "No source path on this request — make sure your dev server emits source maps with absolute filenames.",
    };
  }

  if (!source.startsWith("/")) {
    return {
      error: `Could not derive a filesystem path from "${source}". Inspatch needs absolute source paths (enable source maps with absolute filenames).`,
    };
  }

  const home = realpathSafe(homedir()) ?? homedir();
  const anchor = realpathSafe(dirname(source));
  if (!anchor) {
    return { error: `Source file does not exist on disk: ${source}` };
  }

  if (!isStrictlyUnderHome(anchor, home)) {
    return { error: `Refusing to edit files outside your home directory (${anchor}).` };
  }

  let cur = anchor;
  while (isStrictlyUnderHome(cur, home)) {
    if (existsSync(`${cur}${sep}package.json`)) {
      return { root: cur };
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  if (req.pageSource === "file") {
    return { root: anchor };
  }

  return {
    error: `No package.json found between ${anchor} and ${home}. Start your dev server inside a package.json project.`,
  };
}
