# CLAUDE.md

## LANGUAGE RULE — HIGHEST PRIORITY

**Always match the user's language.** If the user writes in Chinese, every word of your reply must be in Chinese. If in English, reply in English. This rule overrides everything else and applies to every single response, including plans, summaries, and error messages. Never mix languages mid-response.

---

## Spec-Driven Workflow — MANDATORY, NO EXCEPTIONS

You MUST follow these steps in strict order for every code change request.
If you find yourself about to write code or call Edit/Write/Bash without having completed Step 1 AND received explicit user approval — STOP. Go back to Step 1.

**Approval prompt rule:** Whenever you are waiting for the user to approve before you can proceed (after a Plan, before executing a risky action, before committing, etc.), always end your message with:

> 请确认方案，我再执行。（回复 "ok" / "go" / "继续" / "好" 等均可）

---

### Step 0: Research _(new features only — skip for bug fixes)_

Before planning any non-trivial feature:

- Search for mature open-source libraries that solve the problem (npm, GitHub, etc.).
- Research best practices and common patterns for this domain.
- Evaluate trade-offs: proven library vs. custom (maintenance, bundle size, fit).
- **Only build custom if no suitable library exists or fit is poor.**

Summarize findings before writing the Plan.

---

### Step 1: Plan — OUTPUT PLAN, THEN STOP COMPLETELY

Output a plan using this exact format:

```
## Plan
**Goal:** <one sentence>
**Files:** <list of files to create/modify/delete>
**Approach:** <how, key decisions, trade-offs, libraries chosen>
**Risk:** <what could break, security implications>
```

**HARD RULES for Step 1:**

- After printing the Plan, your message ENDS. No code. No "I'll start by...". No partial implementations.
- Do NOT call Edit, Write, Bash, or any file-modifying tool in this turn.
- Do NOT proceed to Step 2 in the same response as the Plan.
- Wait for the user to explicitly reply. Explicit approval = the user says something like "ok", "go", "approved", "yes", "继续", "好", or equivalent.
- A user asking a clarifying question is NOT approval — answer it and wait again.
- If the user approves but asks for changes to the plan, revise the plan and STOP again.

**You are prohibited from starting Step 2 until you receive explicit approval in a separate user message.**

---

### Step 2: Execute

Implement the approved plan exactly. If scope needs to change mid-implementation, STOP and re-plan (back to Step 1).

---

### Step 3: Verify

- **Every feature must have test cases.** Add or update tests before marking done.
- Run `bun test <affected paths>` — target only files touched by the change.
- If the change touches shared logic or cross-cutting concerns, run `bun test` (all tests).
- Fix all failures before proceeding.

---

### Step 4: Summary

```
## Summary
**Changed:** <file list with one-line descriptions>
**Tests:** <tests added/updated/passed>
**Notes:** <anything the user should know>
```

Check uncommitted changes with `git status` and `git diff`. Then print:

1. A short description of what the commit contains.
2. A ready-to-run git command — do NOT execute it:

```
git add . && git commit -m "<type>(<scope>): <subject>

- <key change 1>
- <key change 2>"
```

Scopes: `extension`, `server`, `shared`.

- Subject line: concise, imperative, ≤72 chars.
- Bullet body: 3–6 meaningful changes, skip trivial details.

---

## Project Structure

Monorepo with three packages:

- `packages/extension` — Chrome extension (WXT + React 19 + Tailwind CSS 4)
- `packages/server` — Local WebSocket server (Bun + Claude Agent SDK)
- `packages/shared` — Shared types and Zod schemas (`@inspatch/shared`)

Key scripts (run from root):

- `bun dev` — start extension dev server
- `bun server` — start backend server
- `bun test` — run all tests

---

## Code Rules

- Bun runtime. ESM only. No `require()`, no npm/yarn.
- `bun:test` for testing. No Jest, no Vitest.
- Single quotes, no semicolons, trailing commas, 2-space indent.
- Cross-package imports: `@inspatch/shared`.
- Comments in English only. Explain _why_, never _what_.
- Add logs for errors always; key lifecycle events where useful. Remove noise-only logs before committing.
- Tests in `__tests__/<SourceFile>.test.ts`.
- Commits: `feat(scope): ...`, `fix(scope): ...`.

## Code Quality

- **No redundant code.** Extract repeated logic.
- **Single responsibility.** One file = one clear purpose. Split large files proactively.
- **Encapsulate shared logic** into utilities or hooks — never copy-paste.
- **No dead code**, no unused imports, no commented-out code.
- Functions: small, single-purpose, early returns.
- Naming: self-explanatory — if it needs a comment, rename it.
- Keep folder structure clean and intentional.

## Security

- Validate all external input with Zod at the API boundary.
- The server only binds to `127.0.0.1` — never expose it to external interfaces.
- Never log or hardcode secrets, tokens, or private keys.
- Never commit `.env`.

---

## Self-Check Before Every Response

Before generating any response to a code change request, answer these:

1. Have I output a Plan yet? If no → go to Step 1.
2. Has the user explicitly approved the Plan in their last message? If no → do not write any code.
3. Am I about to call Edit/Write/Bash? If yes and Step 2 hasn't started → STOP.
