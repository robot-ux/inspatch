---
phase: quick
plan: 260414-kuh
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared/src/logger.ts
  - packages/shared/src/index.ts
  - packages/server/src/server.ts
  - packages/server/src/index.ts
  - packages/server/src/queue.ts
  - packages/extension/entrypoints/sidepanel/hooks/useWebSocket.ts
  - packages/extension/entrypoints/background.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "All logging goes through logger utility instead of raw console calls"
    - "Debug-level logs appear in development, only info+ in production"
    - "Logger prefixes messages with component tags (e.g. [ws], [queue])"
  artifacts:
    - path: "packages/shared/src/logger.ts"
      provides: "Structured logger with level-based filtering"
      exports: ["createLogger", "LogLevel"]
    - path: "packages/shared/src/index.ts"
      provides: "Re-exports logger from shared barrel"
  key_links:
    - from: "packages/server/src/server.ts"
      to: "packages/shared/src/logger.ts"
      via: "import { createLogger } from '@inspatch/shared'"
    - from: "packages/server/src/index.ts"
      to: "packages/shared/src/logger.ts"
      via: "import { createLogger } from '@inspatch/shared'"
---

<objective>
Add a `logger.ts` utility to `@inspatch/shared` that provides structured, level-aware logging. Default level is `debug` in development and `info` in production (based on `NODE_ENV`). Replace all raw `console.log/warn/error` calls across server and extension packages with the logger.

Purpose: Centralise logging so debug noise can be silenced in production, and every log line carries a consistent component prefix.
Output: `packages/shared/src/logger.ts` + updated imports across server and extension.
</objective>

<context>
@packages/shared/src/index.ts
@packages/shared/src/schemas.ts
@packages/server/src/server.ts
@packages/server/src/index.ts
@packages/server/src/queue.ts
@packages/extension/entrypoints/sidepanel/hooks/useWebSocket.ts
@packages/extension/entrypoints/background.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create logger utility and export from shared barrel</name>
  <files>packages/shared/src/logger.ts, packages/shared/src/index.ts</files>
  <action>
Create `packages/shared/src/logger.ts` with:

1. A `LogLevel` enum or const object: `debug`, `info`, `warn`, `error` (numeric order 0-3).
2. A `createLogger(tag: string)` factory that returns an object with `.debug()`, `.info()`, `.warn()`, `.error()` methods.
3. Each method delegates to the corresponding `console` method, prepending `[tag]` to the first argument.
4. A module-level `currentLevel` derived from `process.env.NODE_ENV`: if `"production"` → `info`, else → `debug`. Also support `process.env.LOG_LEVEL` override (parsed case-insensitively).
5. Methods below `currentLevel` are no-ops.
6. Keep it zero-dependency, pure TypeScript, < 60 lines.

Then add `createLogger` and `LogLevel` to the re-exports in `packages/shared/src/index.ts`.
  </action>
  <verify>
    <automated>cd packages/shared && npx tsc --noEmit</automated>
  </verify>
  <done>logger.ts exists, exports createLogger and LogLevel, compiles without errors, re-exported from shared barrel.</done>
</task>

<task type="auto">
  <name>Task 2: Replace raw console calls with logger across server and extension</name>
  <files>packages/server/src/server.ts, packages/server/src/index.ts, packages/server/src/queue.ts, packages/extension/entrypoints/sidepanel/hooks/useWebSocket.ts, packages/extension/entrypoints/background.ts</files>
  <action>
Replace every `console.log`, `console.warn`, `console.error`, and `console.debug` call in the listed files with the appropriate logger method. Create a logger instance at the top of each file with an appropriate tag:

- `server.ts` → `createLogger("ws")` — preserves existing `[ws]` prefix convention, so strip the manual `[ws]` from log strings.
- `index.ts` (server) → `createLogger("server")`.
- `queue.ts` → `createLogger("queue")`.
- `useWebSocket.ts` → `createLogger("ws-client")` — replace the manual `[Inspatch]` prefix.
- `background.ts` → `createLogger("bg")`.

Mapping:
- `console.log` → `logger.info` (these are operational messages, not debug)
- `console.warn` → `logger.warn`
- `console.error` → `logger.error`

Keep the same message content (minus redundant manual prefixes like `[ws]` or `[Inspatch]`).

In the extension context, `process.env.NODE_ENV` is set by WXT/Vite at build time so the level detection works without changes.
  </action>
  <verify>
    <automated>cd packages/server && npx tsc --noEmit && cd ../extension && npx tsc --noEmit</automated>
  </verify>
  <done>No raw console.log/warn/error calls remain in the listed files. All logging goes through createLogger. TypeScript compiles cleanly.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

No new trust boundaries introduced — logger is an internal utility with no I/O beyond console.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | I (Information Disclosure) | logger.ts | accept | Logger only wraps console — no data leaves the process. In production, debug-level messages are suppressed, reducing accidental secret exposure in logs. |
</threat_model>

<verification>
- `grep -r "console\.\(log\|warn\|error\|debug\)" packages/server/src/ packages/extension/entrypoints/background.ts packages/extension/entrypoints/sidepanel/hooks/useWebSocket.ts` returns zero matches (except inside logger.ts itself).
- TypeScript compiles cleanly for both server and extension packages.
</verification>

<success_criteria>
- logger.ts exists in shared package, exports createLogger and LogLevel
- All server and extension files use logger instead of raw console
- Debug level defaults in dev, info in production
- LOG_LEVEL env var overrides the default
</success_criteria>

<output>
After completion, create `.planning/quick/260414-kuh-add-logger-ts-utility-debug-level-defaul/260414-kuh-SUMMARY.md`
</output>
