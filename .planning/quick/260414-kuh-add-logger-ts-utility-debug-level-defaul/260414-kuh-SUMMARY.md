# Quick Task 260414-kuh: Add logger.ts utility — Summary

**Completed:** 2026-04-14
**Commit:** cb4fac7

## What Changed

### New: `packages/shared/src/logger.ts`
- `createLogger(tag)` factory returns `{ debug, info, warn, error }` methods
- Each method prefixes output with `[tag]`
- Level resolved from `NODE_ENV` (production → info, else → debug)
- `LOG_LEVEL` env var overrides the default (case-insensitive)
- Methods below current level are no-ops (zero overhead)
- Zero dependencies, works in both Bun (server) and browser (extension via WXT/Vite)

### Updated: `packages/shared/src/index.ts`
- Re-exports `createLogger`, `LogLevel`, `Logger`, `LogLevelName`

### Updated: Server files
- `server.ts` → `createLogger("ws")`, replaced 4 console calls
- `index.ts` → `createLogger("server")`, replaced 5 console calls
- `queue.ts` — no console calls to replace (already clean)

### Updated: Extension files
- `useWebSocket.ts` → `createLogger("ws-client")`, replaced 2 console.warn calls
- `background.ts` → `createLogger("bg")`, replaced 1 console.error pattern

## Verification
- TypeScript compiles cleanly (shared, extension)
- Pre-existing `bun:test` / `@types/bun` errors unaffected
- No raw `console.log/warn/error` calls remain in modified files
