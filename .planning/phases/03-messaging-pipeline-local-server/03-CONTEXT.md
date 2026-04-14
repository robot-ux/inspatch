# Phase 3: Messaging Pipeline & Local Server - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the real-time communication layer: a local Bun WebSocket server started via `bunx inspatch-server`, and extension-side WebSocket client with auto-reconnection. All messages validated against shared Zod schemas on both ends. Server queues requests serially to prevent concurrent file modifications. Side panel connection status indicator wired to real connection state.

</domain>

<decisions>
## Implementation Decisions

### WebSocket Ownership
- **D-01:** Side panel owns the WebSocket connection (not service worker). Side panel has a longer lifetime while visible and avoids MV3 service worker 30-second termination killing the connection (per CP-1 in PITFALLS.md).
- **D-02:** When side panel opens, it establishes WebSocket to `ws://localhost:{port}`. When side panel closes, connection drops naturally.
- **D-03:** Connection state is shared with content script and service worker via `chrome.runtime.sendMessage` so other extension contexts know server status.

### Reconnection Strategy
- **D-04:** Exponential backoff reconnection: 1s → 2s → 4s → 8s → 16s → 30s cap. Reset backoff on successful connection.
- **D-05:** Keepalive ping every 20s from client. Server responds with pong. If no pong within 5s, treat as disconnected and trigger reconnect.
- **D-06:** Side panel UI shows real-time connection status: green dot = connected, yellow dot = reconnecting, gray dot = disconnected.

### Server Architecture
- **D-07:** Use Bun's native WebSocket server (`Bun.serve` with `websocket` handler) — no external ws package needed. Bun handles WebSocket upgrade natively.
- **D-08:** Server started via `bunx inspatch-server` which runs `packages/server/src/index.ts` as the entry point.
- **D-09:** Server binds to `127.0.0.1` only (not `0.0.0.0`) for security — local-only tool.
- **D-10:** Default port 9377 (configurable via `--port` flag or `INSPATCH_PORT` env var).

### Message Validation
- **D-11:** Server validates all incoming WebSocket messages against `MessageSchema` from `@inspatch/shared`. Invalid messages are rejected with a `StatusUpdate` error response.
- **D-12:** Extension validates all incoming WebSocket messages from server using the same shared schemas.
- **D-13:** Ping/pong messages use a simple `{ type: "ping" }` / `{ type: "pong" }` format outside the main MessageSchema (internal protocol).

### Request Queue
- **D-14:** Server maintains an in-memory serial queue. When a `change_request` arrives, it's queued. Only one request is processed at a time.
- **D-15:** Queue sends `StatusUpdate` messages back to client for each stage of processing (analyzing → locating → generating → applying → complete/error).
- **D-16:** Queue rejects new requests while one is actively being processed by Claude Code (Phase 6 wires this). For now, queue accepts and immediately responds with a placeholder "queued" status.

### Claude's Discretion
- Exact WebSocket message framing details
- Server startup banner and logging format
- Queue implementation internals (array vs linked list)
- Error message wording for validation failures

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Communication Architecture
- `.planning/research/PITFALLS.md` §CP-1 — Service worker WebSocket termination; side panel ownership rationale
- `.planning/research/ARCHITECTURE.md` — Extension architecture, communication patterns

### Requirements
- `.planning/REQUIREMENTS.md` — COMM-01 through COMM-04, SERV-01 through SERV-03

### Prior Phase Context
- `.planning/phases/01-project-foundation-extension-shell/01-CONTEXT.md` — D-07 through D-09 (shared schemas)
- `.planning/phases/02-element-selection-visual-overlay/02-CONTEXT.md` — D-11 through D-13 (messaging patterns)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/shared/src/schemas.ts` — All message types already defined (ConnectionStatus, ElementSelection, ChangeRequest, StatusUpdate, ChangeResult) with discriminated union and `parseMessage()` function
- `packages/server/src/index.ts` — Placeholder with `SERVER_VERSION` export
- `packages/server/package.json` — Already depends on `@inspatch/shared`
- `packages/extension/entrypoints/sidepanel/App.tsx` — Has `connected` state and status indicator UI

### Established Patterns
- Zod schema validation with `safeParse()` for message routing
- `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` for extension internal messaging
- Error handling with `.catch(() => {})` for optional listeners

### Integration Points
- Side panel App.tsx `connected` state → needs to be wired to real WebSocket status
- Server `src/index.ts` → becomes the WebSocket server entry point
- `@inspatch/shared` schemas → used for validation on both ends
- Root `package.json` → needs `server` script and `bin` entry for `bunx inspatch-server`

</code_context>

<specifics>
## Specific Ideas

- User explicitly chose Bun for everything — server should use `Bun.serve()` native API, not Node.js http/ws packages
- Port 9377 is memorable (INSP on a phone keypad... close enough)
- `bunx inspatch-server` should work as a single command with zero config

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-messaging-pipeline-local-server*
*Context gathered: 2026-04-14*
