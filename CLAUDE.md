# Inspatch

## Project Overview

Inspatch is a Chrome extension + local WebSocket server that lets developers click any UI element on `localhost`, describe a desired change, and have Claude Code edit the source files directly. The extension captures element context (XPath, React component name, source file/line, styles, optional screenshot) and sends it to the local server, which runs Claude Agent SDK to perform the actual file edits.

## Tech Stack

- **Runtime:** Bun
- **Monorepo:** Bun workspaces (`packages/*`)
- **Extension:** React 19, Tailwind v4, WXT (Chrome MV3)
- **Server:** Bun + Express-style HTTP, native Bun WebSocket, `@anthropic-ai/claude-agent-sdk`
- **Shared:** Zod v4 schemas (single source of truth for all protocol types)
- **Language:** TypeScript strict mode throughout
- **Published:** `@inspatch/server` on npm (entry: `packages/server/bin/run.cjs`)

## Architecture

Bun monorepo with three packages:

```
packages/
  extension/   Chrome extension (React 19 + Tailwind v4, built with WXT)
  server/      Local WebSocket server (Bun + Express, uses Claude Agent SDK)
  shared/      Zod schemas and shared types (consumed by both packages)
```

### Data flow

1. Extension captures element (XPath, React component name, source file/line, computed styles, optional screenshot)
2. Extension sends `change_request` over WebSocket to the local server (`ws://127.0.0.1:9377`)
3. `RequestQueue.enqueue` calls `project-resolver.ts` to resolve the target project root from the request's own `sourceFile`/`filePath` (walks up to the nearest `package.json`, strictly bounded by `$HOME`). Rejects with a clear error if it can't resolve; otherwise queues the request with that root.
4. `claude-runner.ts` calls `@anthropic-ai/claude-agent-sdk` with `cwd` = the resolved root, `permissionMode: "acceptEdits"`, and tools: `Read, Edit, Write, MultiEdit, Bash, Grep, Glob`
5. Claude reads and edits that project's source files directly
6. Server sends `status_update` events (streaming) and a final `change_result` with git diff back to the extension

### Key files

- `packages/shared/src/schemas.ts` — all WebSocket message types (Zod schemas + TypeScript types)
- `packages/server/src/server.ts` — Bun WebSocket server, `/health` and `/open-in-editor` HTTP endpoints
- `packages/server/src/queue.ts` — `RequestQueue`: sequential processing, reconnect/resume support (24h result buffer); resolves per-request project root via `project-resolver.ts`
- `packages/server/src/project-resolver.ts` — derives Claude `cwd` from a request's source path; `$HOME`-bounded, `package.json`-anchored, rejects when unresolved
- `packages/server/src/claude-runner.ts` — builds prompt, runs Claude Agent SDK, extracts modified files and git diff
- `packages/server/src/editor.ts` — auto-detects Cursor vs VS Code; handles `open-in-editor` requests
- `packages/extension/entrypoints/` — WXT entrypoints: `background.ts`, `content.ts`, `sidepanel/`, `fiber-main-world.ts`, `console-main-world.ts`

## Common Commands

```bash
bun install                              # install all workspace deps
bun dev                                  # extension dev server (http://localhost:3737, hot reload)
bun server                                # local server (auto-resolves project per request)
bun test                                 # run all tests

# Load extension in Chrome:
# chrome://extensions → Enable Developer mode → Load unpacked → packages/extension/.output/chrome-mv3-dev/

# Publishing
# Server: npm publish (entry: packages/server/bin/run.cjs)
# Extension: wxt zip → upload .zip to GitHub Releases
```

CLI flags for server: `--port <number>`, `--editor <cursor|vscode>`, `--timeout <seconds>`. No `--project` — for each request the server walks up from the inspected element's source path to the nearest `package.json`, bounded by `$HOME`.

---

## LANGUAGE RULE — HIGHEST PRIORITY

**Always match the user's language.** If the user writes in Chinese, every word of your reply must be in Chinese. If in English, reply in English. This rule overrides everything else and applies to every single response, including plans, summaries, and error messages. Never mix languages mid-response.

---

## Spec-Driven Workflow — MANDATORY

Follow these steps in strict order for every code change request. If you are about to call Edit/Write/Bash without completing Step 1 and receiving explicit approval — STOP. Go back to Step 1.

### Step 0: Research *(new features only — skip for bug fixes)*

Before planning, surface your understanding:

- **State assumptions explicitly.** If the request has multiple valid interpretations, list them — don't pick one silently. Ask for clarification before proceeding.
- Search for mature libraries that solve the problem. Evaluate trade-offs: proven library vs. custom (maintenance, fit, size).
- **Only build custom if no suitable library exists or the fit is poor.**

Summarize findings, then move to Step 1.

### Step 1: Plan — OUTPUT PLAN, THEN STOP COMPLETELY

Output a plan using this exact format:

```
## Plan
**Goal:** <one sentence>
**Assumptions:** <explicit assumptions; flag any ambiguity>
**Files:** <list of files to create/modify/delete>
**Approach:** <how, key decisions, trade-offs, libraries chosen>
**Verify:** <what success looks like — which test passes, which behavior works>
**Risk:** <what could break, security implications>
```

**HARD RULES:**
- After printing the Plan, your message ENDS. No code. No "I'll start by...".
- Do NOT call Edit, Write, Bash, or any file-modifying tool in this turn.
- Wait for the user to explicitly reply. Explicit approval = "ok", "go", "yes", "继续", "好", or equivalent.
- A clarifying question is NOT approval — answer it and wait again.
- If the user approves but asks for changes, revise the plan and STOP again.

### Step 2: Execute

Implement the approved plan exactly. Rules while executing:

- **Surgical changes only.** Every changed line must trace directly to the task. Don't "improve" adjacent code, comments, or formatting.
- **Minimum code.** No speculative features, no unrequested abstractions, no configurability that wasn't asked for.
- **Dead code:**
  - Orphans YOUR changes created → remove immediately.
  - Pre-existing dead code you notice → mention in Summary, don't delete it.
- If scope needs to change mid-implementation → STOP, go back to Step 1.

### Step 3: Verify

- Run the project's test suite (see Common Commands above).
- Run lint and format checks.
- Run type checking.
- Fix all failures before proceeding.
- Confirm the **Verify** criteria from Step 1 are met.

### Step 4: Summary

```
## Summary
**Changed:** <file list with one-line descriptions>
**Tests:** <tests added/updated/passed>
**Notes:** <dead code noticed, trade-offs made, anything the user should know>
```

Then print a ready-to-run git command — do NOT execute it.

---

## Code Quality

- **No redundant code.** Extract repeated logic; never copy-paste.
- **Single responsibility.** One file = one clear purpose. Split large files proactively.
- **No abstractions for single-use code.** Three similar lines > a premature abstraction.
- **No dead code**, no unused imports, no commented-out code (that you wrote).
- Functions: small, single-purpose, early returns.
- Naming: self-explanatory — if it needs a comment, rename it.
- No error handling for impossible scenarios. Trust internal guarantees; validate only at system boundaries.
- Folder structure: clean and intentional.

---

## Security Baseline

- Validate all external input at the system boundary.
- Never log secrets, private keys, or credentials.
- Never hardcode secrets — use environment variables.
- Never commit `.env` or credential files.

---

## Self-Check Before Every Response

Before responding to a code change request:
1. Have I output a Plan yet? If no → go to Step 1.
2. Has the user explicitly approved the Plan? If no → do not write any code.
3. Am I about to call Edit/Write/Bash? If yes and Step 2 hasn't started → STOP.
