# Phase 3: Messaging Pipeline & Local Server - Research

**Researched:** 2026-04-14
**Domain:** WebSocket communication, Bun native server, Chrome extension side panel networking
**Confidence:** HIGH

## Summary

This phase builds the real-time communication backbone between the Chrome extension and a local Bun WebSocket server. The critical architectural decision — side panel owns the WebSocket connection, not the service worker — avoids the MV3 30-second termination problem (CP-1) entirely. Bun's native `Bun.serve()` WebSocket API eliminates the need for the `ws` package, providing a zero-dependency server with 7x throughput over Node.js+ws.

The existing `@inspatch/shared` Zod schemas already define the core message types (ChangeRequest, StatusUpdate, ChangeResult, etc.) as a discriminated union. This phase wires them into real WebSocket transport with validation on both ends, adds request ID correlation for async response tracking, and implements a serial request queue on the server to prevent concurrent file modifications.

**Primary recommendation:** Use Bun.serve() with native WebSocket upgrade in the fetch handler. Side panel creates WebSocket via standard browser API with exponential backoff reconnection. Server validates all messages against shared Zod schemas. Keep the architecture simple — single client, single server, serial queue.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Side panel owns the WebSocket connection (not service worker). Side panel has a longer lifetime while visible and avoids MV3 service worker 30-second termination killing the connection (per CP-1 in PITFALLS.md).
- **D-02:** When side panel opens, it establishes WebSocket to `ws://localhost:{port}`. When side panel closes, connection drops naturally.
- **D-03:** Connection state is shared with content script and service worker via `chrome.runtime.sendMessage` so other extension contexts know server status.
- **D-04:** Exponential backoff reconnection: 1s → 2s → 4s → 8s → 16s → 30s cap. Reset backoff on successful connection.
- **D-05:** Keepalive ping every 20s from client. Server responds with pong. If no pong within 5s, treat as disconnected and trigger reconnect.
- **D-06:** Side panel UI shows real-time connection status: green dot = connected, yellow dot = reconnecting, gray dot = disconnected.
- **D-07:** Use Bun's native WebSocket server (`Bun.serve` with `websocket` handler) — no external ws package needed. Bun handles WebSocket upgrade natively.
- **D-08:** Server started via `bunx inspatch-server` which runs `packages/server/src/index.ts` as the entry point.
- **D-09:** Server binds to `127.0.0.1` only (not `0.0.0.0`) for security — local-only tool.
- **D-10:** Default port 9377 (configurable via `--port` flag or `INSPATCH_PORT` env var).
- **D-11:** Server validates all incoming WebSocket messages against `MessageSchema` from `@inspatch/shared`. Invalid messages are rejected with a `StatusUpdate` error response.
- **D-12:** Extension validates all incoming WebSocket messages from server using the same shared schemas.
- **D-13:** Ping/pong messages use a simple `{ type: "ping" }` / `{ type: "pong" }` format outside the main MessageSchema (internal protocol).
- **D-14:** Server maintains an in-memory serial queue. When a `change_request` arrives, it's queued. Only one request is processed at a time.
- **D-15:** Queue sends `StatusUpdate` messages back to client for each stage of processing (analyzing → locating → generating → applying → complete/error).
- **D-16:** Queue rejects new requests while one is actively being processed by Claude Code (Phase 6 wires this). For now, queue accepts and immediately responds with a placeholder "queued" status.

### Claude's Discretion
- Exact WebSocket message framing details
- Server startup banner and logging format
- Queue implementation internals (array vs linked list)
- Error message wording for validation failures

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COMM-01 | Extension communicates with local server via WebSocket with automatic reconnection | Side panel WebSocket client with exponential backoff (D-04). Standard browser WebSocket API works in side panel context. |
| COMM-02 | Service worker maintains WebSocket connection with keepalive heartbeat (20s ping) | **Reinterpreted per D-01:** Side panel (not SW) owns connection. 20s keepalive ping from client (D-05). Service worker is notified of state via chrome.runtime.sendMessage (D-03). |
| COMM-03 | All messages between extension and server are validated with shared Zod schemas | Existing `MessageSchema` discriminated union + `parseMessage()` in `@inspatch/shared`. Validate with `safeParse()` on both ends (D-11, D-12). |
| COMM-04 | Connection state persists across service worker restarts via chrome.storage.session | Side panel owns connection so SW restart doesn't kill it. Side panel writes connection state to `chrome.storage.session` for SW/content script access. |
| SERV-01 | Local server can be started with a single command (`bunx inspatch-server`) | Bun runs .ts files directly. `bin` field in package.json points to `src/index.ts`. `Bun.serve()` native API (D-07, D-08). |
| SERV-02 | Server validates incoming requests using shared Zod schemas | Same `parseMessage()` from `@inspatch/shared` used server-side (D-11). |
| SERV-03 | Server queues requests serially to prevent concurrent file modifications | In-memory queue, one request at a time (D-14). Placeholder response for now (D-16). |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun (runtime) | 1.3.12 | Server runtime + WebSocket | Already installed. Native `Bun.serve()` with WebSocket support. No external dependencies needed. [VERIFIED: local `bun --version`] |
| @inspatch/shared | workspace:* | Zod schemas + types | Already exists with MessageSchema, parseMessage(), all message types defined. [VERIFIED: codebase] |
| zod | ^4.0.0 | Message validation | Already a dependency of @inspatch/shared. `safeParse()` for both client and server validation. [VERIFIED: packages/shared/package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nanoid | 5.x | Request ID generation | Generate unique IDs for request-response correlation. URL-safe, cryptographically strong. [ASSUMED — recommended in STACK.md] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bun.serve() native WS | ws package | ws requires Node.js http server + manual upgrade. Bun native is zero-dep, 7x faster, and purpose-built for this runtime. No reason to use ws with Bun. |
| nanoid | crypto.randomUUID() | Built-in but produces longer strings (36 chars). nanoid is shorter (21 chars default), URL-safe, and already recommended in STACK.md. Either works. |
| Side panel WS owner | Service worker WS owner | SW gets killed after 30s inactivity (CP-1). Side panel lives as long as it's visible. Clear win for side panel. |

**Installation:**
```bash
cd packages/server && bun add nanoid
cd packages/shared && bun add nanoid
```

**Version verification:** nanoid version should be confirmed at install time via `bun add`. No additional packages needed — Bun's native APIs cover WebSocket server functionality.

## Architecture Patterns

### Recommended Project Structure (Phase 3 additions)
```
packages/
├── server/
│   ├── src/
│   │   ├── index.ts              # Entry point: parse CLI args, start server
│   │   ├── server.ts             # Bun.serve() setup with WebSocket handlers
│   │   └── queue.ts              # Serial request queue
│   └── package.json              # bin entry for bunx
├── shared/
│   └── src/
│       ├── schemas.ts            # Extended with requestId, ping/pong protocol schemas
│       └── index.ts              # Re-exports
└── extension/
    └── entrypoints/
        └── sidepanel/
            ├── App.tsx            # Wired to real WebSocket state
            └── hooks/
                └── useWebSocket.ts  # WebSocket client hook with reconnection
```

### Pattern 1: Bun.serve() WebSocket Server
**What:** Single `Bun.serve()` call handles both HTTP (health check) and WebSocket (upgrade) in the `fetch` handler.
**When to use:** Always — this is the only server entry point.
**Example:**
```typescript
// Source: https://bun.sh/docs/api/websockets [VERIFIED]
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 9377,
  fetch(req, server) {
    if (server.upgrade(req)) {
      return undefined;
    }
    return new Response("Inspatch server running", { status: 200 });
  },
  websocket: {
    message(ws, message) {
      // Parse and validate against shared schemas
    },
    open(ws) {
      // Track connection
    },
    close(ws, code, reason) {
      // Clean up connection state
    },
  },
});
```

Key Bun.serve() WebSocket specifics [VERIFIED: bun.sh/docs/api/websockets]:
- `server.upgrade(req)` returns `boolean` — if `true`, return `undefined` (not a Response)
- Handlers are declared once per server, not per socket (performance optimization)
- `ws.data` carries per-connection contextual data passed via `server.upgrade(req, { data: {...} })`
- `idleTimeout` defaults to 120 seconds (configurable)
- `sendPings: true` by default — Bun auto-sends WebSocket protocol pings
- `maxPayloadLength` defaults to 16MB
- `ws.send()` returns a number: `-1` (backpressure), `0` (dropped), `1+` (bytes sent)

### Pattern 2: Side Panel WebSocket Client with Reconnection
**What:** React hook managing WebSocket lifecycle with exponential backoff.
**When to use:** Side panel component tree — single hook instance manages the connection.
**Example:**
```typescript
// Side panel WebSocket hook pattern
function useWebSocket(url: string) {
  const [status, setStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000); // Start at 1s
  const pingIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const pongTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    const ws = new WebSocket(url);
    
    ws.onopen = () => {
      setStatus('connected');
      backoffRef.current = 1000; // Reset backoff
      startKeepalive(ws);
      broadcastConnectionState(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'pong') {
        clearTimeout(pongTimeoutRef.current);
        return;
      }
      // Validate against shared schemas
      const result = parseMessage(data);
      if (result.success) {
        // Route message
      }
    };

    ws.onclose = () => {
      cleanup();
      setStatus('reconnecting');
      broadcastConnectionState(false);
      scheduleReconnect();
    };

    wsRef.current = ws;
  }, [url]);

  // Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s cap
  const scheduleReconnect = useCallback(() => {
    setTimeout(connect, backoffRef.current);
    backoffRef.current = Math.min(backoffRef.current * 2, 30_000);
  }, [connect]);

  return { status, send, lastMessage };
}
```

### Pattern 3: Connection State Broadcasting
**What:** Side panel broadcasts WebSocket connection state to other extension contexts.
**When to use:** Whenever connection state changes (connected/disconnected).
**Example:**
```typescript
// Source: Chrome Extensions messaging API [VERIFIED: developer.chrome.com]
async function broadcastConnectionState(connected: boolean) {
  // Persist to storage.session for contexts that weren't listening
  await chrome.storage.session.set({ serverConnected: connected });
  
  // Broadcast to service worker and any listeners
  chrome.runtime.sendMessage({ 
    type: 'connection_status', 
    connected 
  }).catch(() => {}); // Ignore if no listeners
}
```

### Pattern 4: Serial Request Queue
**What:** In-memory FIFO queue that processes one request at a time.
**When to use:** Server-side, when handling ChangeRequest messages.
**Example:**
```typescript
class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;

  enqueue(request: ChangeRequest, ws: ServerWebSocket): void {
    this.queue.push({ request, ws, enqueuedAt: Date.now() });
    this.process();
  }

  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    
    const { request, ws } = this.queue.shift()!;
    ws.send(JSON.stringify({ 
      type: 'status_update', 
      status: 'analyzing', 
      message: 'Request queued for processing' 
    }));
    
    // Phase 6 wires actual Claude Code invocation here
    // For now: placeholder acknowledgment
    
    this.processing = false;
    this.process(); // Process next if queued
  }
}
```

### Pattern 5: CLI Argument Parsing for Server
**What:** Parse `--port` flag and `INSPATCH_PORT` env var at startup.
**When to use:** Server entry point (`index.ts`).
**Example:**
```typescript
// Bun provides process.argv and Bun.env natively
const args = process.argv.slice(2);
const portFlagIdx = args.indexOf('--port');
const port = portFlagIdx !== -1 
  ? parseInt(args[portFlagIdx + 1], 10)
  : parseInt(Bun.env.INSPATCH_PORT || '9377', 10);

if (isNaN(port) || port < 1 || port > 65535) {
  console.error('Invalid port number');
  process.exit(1);
}
```

### Anti-Patterns to Avoid
- **Service worker WebSocket ownership:** CP-1 makes this unreliable. Side panel is the correct owner. [VERIFIED: PITFALLS.md, Chrome docs]
- **ws package with Bun:** Bun.serve() has native WebSocket. Adding ws is unnecessary weight and bypasses Bun's optimized path. [VERIFIED: bun.sh/docs]
- **Validating only on one side:** Both extension AND server MUST validate. A corrupt message from either side should be caught and rejected. [Per D-11, D-12]
- **Global variables in server for connection state:** Use `ws.data` on the ServerWebSocket instance to attach per-connection metadata. Global state makes multi-connection handling fragile.
- **stdin pipe for future Claude Code integration:** Pass prompt as CLI argument, not via stdin. Known issue with Claude Code waiting for stdin.end(). [VERIFIED: ARCHITECTURE.md anti-pattern 6]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket server | Custom HTTP upgrade + frame parsing | `Bun.serve()` with `websocket` handler | Bun handles upgrade, framing, ping/pong, backpressure natively |
| Message validation | Manual type checking with if/switch | Zod `safeParse()` with discriminated unions | Type-safe at compile AND runtime; auto-generates TypeScript types |
| Unique request IDs | Math.random() or Date.now() | nanoid (or crypto.randomUUID()) | Cryptographically strong, collision-resistant, URL-safe |
| Reconnection backoff | Custom timer management | Structured hook with backoff constant doubling | Simple exponential backoff with cap is well-understood and reliable |
| CLI arg parsing | Custom argv parsing beyond basics | `process.argv` manual parse for 1-2 flags | Only `--port` is needed. A library would be overkill for one flag. |

**Key insight:** Bun's native APIs cover the entire server-side WebSocket story. The only external dependency needed for this phase is potentially nanoid for request IDs. Everything else is Bun built-ins + existing shared schemas.

## Common Pitfalls

### Pitfall 1: Bun.serve() fetch handler must return undefined on successful upgrade
**What goes wrong:** Returning a Response object after `server.upgrade(req)` succeeds causes the connection to break — Bun sends both the upgrade response AND the returned Response.
**Why it happens:** The fetch handler normally requires a Response return. WebSocket upgrade is the exception.
**How to avoid:** Check `if (server.upgrade(req)) return undefined;` — explicit `undefined` return (or just `return;`). [VERIFIED: bun.sh/docs/api/websockets]
**Warning signs:** WebSocket connects then immediately disconnects; client receives HTTP response text instead of upgrade.

### Pitfall 2: Side panel WebSocket creates new connection on every React re-render
**What goes wrong:** If the WebSocket is created inside a `useEffect` without proper cleanup and dependency management, React re-renders create duplicate connections.
**Why it happens:** React strict mode double-invokes effects in development. Missing cleanup function means old connections aren't closed.
**How to avoid:** Store WebSocket in a `useRef`. Return a cleanup function from `useEffect` that closes the socket. Use empty dependency array `[]` for connection effect, or memoize the URL.
**Warning signs:** Server logs show multiple connections from same client; duplicate messages; memory leaks.

### Pitfall 3: JSON.parse() on non-text WebSocket messages
**What goes wrong:** `Bun.serve()` websocket message handler receives `string | Buffer`. Calling `JSON.parse()` on a Buffer throws or produces garbage.
**Why it happens:** WebSocket supports both text and binary frames. Bun passes the raw type to the handler.
**How to avoid:** Check `typeof message === 'string'` before parsing. Convert Buffer to string if needed: `const text = typeof message === 'string' ? message : message.toString();`
**Warning signs:** Intermittent JSON parse errors; works with browser WebSocket client but fails with other clients.

### Pitfall 4: chrome.runtime.sendMessage fails when no listener exists
**What goes wrong:** Broadcasting connection state from side panel via `chrome.runtime.sendMessage` throws "Could not establish connection. Receiving end does not exist" if no other context is listening.
**Why it happens:** The service worker may be inactive (terminated). Content script may not be injected yet.
**How to avoid:** Always `.catch(() => {})` on sendMessage calls that are broadcast-style (fire-and-forget). Use `chrome.storage.session` as the persistent source of truth; sendMessage is a notification optimization.
**Warning signs:** Console errors about "Receiving end does not exist"; connection state updates work intermittently.

### Pitfall 5: Port 9377 already in use (EADDRINUSE)
**What goes wrong:** Server fails to start because another process (or a previous crashed instance) holds the port.
**Why it happens:** Previous server didn't shut down cleanly; another tool uses the same port.
**How to avoid:** Catch the error from `Bun.serve()`, log a clear message with `lsof -i :9377` suggestion, and exit with non-zero code. Consider offering `--port` override.
**Warning signs:** "EADDRINUSE" or "address already in use" error on startup.

### Pitfall 6: WebSocket keepalive ping/pong confused with Bun's native pings
**What goes wrong:** Bun.serve() has `sendPings: true` by default, which sends WebSocket protocol-level pings. The application also sends JSON `{ type: "ping" }` messages. These are different layers.
**Why it happens:** WebSocket protocol has built-in ping/pong frames (opcode 0x9/0xA) handled by the browser automatically. Application-level ping/pong are regular text messages parsed by app code.
**How to avoid:** Keep both layers: Bun's native `sendPings` handles low-level connection liveness. Application-level ping/pong (D-05, D-13) provides the 5-second timeout detection that triggers reconnection logic in the side panel.
**Warning signs:** Connection appears alive (protocol pings succeed) but application considers it dead; or vice versa.

### Pitfall 7: Multiple browser windows = multiple side panel connections
**What goes wrong:** Each Chrome window can open its own side panel instance. Server receives multiple WebSocket connections but queue/state management assumes single client.
**Why it happens:** Side panel is per-window, not per-browser. Each creates an independent WebSocket.
**How to avoid:** Server should track connections by ID (via `ws.data`). Queue should process requests FIFO regardless of source connection. Status updates should be sent to the requesting connection only (not broadcast to all).
**Warning signs:** Status updates appear in wrong window; queue processes requests out of expected order.

## Code Examples

### Bun.serve() WebSocket Server (complete pattern)
```typescript
// Source: https://bun.sh/docs/api/websockets [VERIFIED]
import { parseMessage, type Message } from '@inspatch/shared';

type WSData = {
  connectedAt: number;
  id: string;
};

const server = Bun.serve<WSData>({
  hostname: '127.0.0.1',
  port: 9377,
  fetch(req, server) {
    const url = new URL(req.url);
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', version: SERVER_VERSION });
    }
    
    // WebSocket upgrade
    const upgraded = server.upgrade(req, {
      data: {
        connectedAt: Date.now(),
        id: nanoid(),
      },
    });
    
    if (upgraded) return undefined;
    
    return new Response('Expected WebSocket connection', { status: 426 });
  },
  websocket: {
    idleTimeout: 60,
    message(ws, message) {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
      
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        ws.send(JSON.stringify({
          type: 'status_update',
          status: 'error',
          message: 'Invalid JSON',
        }));
        return;
      }

      // Handle protocol-level ping/pong (outside MessageSchema)
      if (parsed && typeof parsed === 'object' && 'type' in parsed) {
        if ((parsed as { type: string }).type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }
      }

      // Validate against shared schemas
      const result = parseMessage(parsed);
      if (!result.success) {
        ws.send(JSON.stringify({
          type: 'status_update',
          status: 'error',
          message: 'Message validation failed',
        }));
        return;
      }

      // Route validated message
      handleMessage(result.data, ws);
    },
    open(ws) {
      console.log(`Client connected: ${ws.data.id}`);
    },
    close(ws, code, reason) {
      console.log(`Client disconnected: ${ws.data.id} (${code})`);
    },
  },
});

console.log(`Inspatch server listening on ws://${server.hostname}:${server.port}`);
```

### Package.json bin configuration for bunx
```json
{
  "name": "inspatch-server",
  "version": "0.0.1",
  "type": "module",
  "bin": {
    "inspatch-server": "src/index.ts"
  },
  "dependencies": {
    "@inspatch/shared": "workspace:*"
  }
}
```
Note: Bun runs .ts files directly — no build step needed for the bin entry. This only works with `bunx`, not `npx`. [VERIFIED: bun.sh/docs/cli/bunx, api2o.com/en/handbook/bun/publish-executable-to-npm-and-bunx]

### Schema extension for request correlation
```typescript
// Extend existing schemas with optional requestId
export const ChangeRequestSchema = z.object({
  type: z.literal("change_request"),
  requestId: z.string().optional(),
  description: z.string().min(1),
  elementXpath: z.string(),
  componentName: z.string().optional(),
  sourceFile: z.string().optional(),
  sourceLine: z.number().optional(),
  screenshotDataUrl: z.string().optional(),
});

export const StatusUpdateSchema = z.object({
  type: z.literal("status_update"),
  requestId: z.string().optional(),
  status: z.enum(["queued", "analyzing", "locating", "generating", "applying", "complete", "error"]),
  message: z.string(),
  progress: z.number().min(0).max(100).optional(),
});
```

### chrome.storage.session for connection state persistence
```typescript
// Source: Chrome Extensions API [VERIFIED: developer.chrome.com]

// Side panel writes connection state
await chrome.storage.session.set({ 
  serverConnected: true,
  serverPort: 9377,
  connectedAt: Date.now(),
});

// Any context reads connection state
const { serverConnected } = await chrome.storage.session.get('serverConnected');

// Content script or service worker listens for changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.serverConnected) {
    const connected = changes.serverConnected.newValue;
    // Update local state
  }
});
```

**Permissions note:** `chrome.storage.session` requires the `storage` permission in manifest. Current permissions list (`activeTab`, `sidePanel`, `scripting`) does NOT include `storage`. Must add it. [VERIFIED: wxt.config.ts]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ws + Node.js http server | Bun.serve() native WebSocket | Bun 0.6+ (2023) | Zero external dependencies for WebSocket server; 7x throughput improvement |
| Service worker WebSocket owner | Side panel / offscreen document owner | Chrome 116+ (2023), community best practice by 2024 | Avoids 30s termination; more reliable connections |
| chrome.storage.local for extension state | chrome.storage.session | Chrome 102+ (2022) | Session-scoped; auto-clears on browser close; designed for ephemeral state |
| Manual JSON.parse + type narrowing | Zod discriminated union safeParse | Zod 3.x+ (2022) | Type-safe validation with auto-generated types; runtime + compile-time safety |
| npx for package execution | bunx for Bun packages | Bun 1.0+ (2023) | Runs .ts files directly; no build step for CLI tools |

**Deprecated/outdated:**
- Service worker WebSocket ownership: Still technically possible with Chrome 116+ keepalive, but side panel ownership is simpler and more reliable for this use case
- `ws` package with Bun: Unnecessary; Bun.serve() native WebSocket is purpose-built and faster

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | nanoid is the best choice for request IDs (vs crypto.randomUUID) | Standard Stack | LOW — either works; crypto.randomUUID() is built-in and acceptable |
| A2 | `chrome.storage.session` requires adding `storage` permission | Code Examples | LOW — easy to verify and add; extension must have this permission or session storage calls will fail |
| A3 | Publishing to npm with `.ts` bin entry works with bunx | Code Examples | MEDIUM — verified with search results, but npm publish workflow with Bun has known issues (oven-sh/bun#18055). May need build step for production publish. |

## Open Questions

1. **npm publish with .ts bin entry**
   - What we know: `bunx` can run .ts files directly from bin field. This works locally and for `bunx` users.
   - What's unclear: Whether npm publish properly handles .ts bin entries for non-Bun users (npx). The `bun publish` command has known issues with bin discovery.
   - Recommendation: Use .ts for development. Before npm publish (future phase), add a build step that compiles to .js with a `#!/usr/bin/env bun` shebang. Not blocking for this phase.

2. **Multiple simultaneous side panels (multi-window)**
   - What we know: Each Chrome window can have its own side panel instance, each creating an independent WebSocket.
   - What's unclear: Whether the queue should be global (across all connections) or per-connection.
   - Recommendation: Global queue (single FIFO). Route status updates to the requesting connection via `ws.data.id`. This is simplest and matches the serial file modification constraint.

3. **Schema versioning for forward compatibility**
   - What we know: Extension and server share schemas via @inspatch/shared workspace dependency.
   - What's unclear: What happens when schema versions mismatch (e.g., old extension, new server after update).
   - Recommendation: Add a `protocolVersion` field to the WebSocket handshake (in `server.upgrade()` data). For v1, hard-fail on mismatch. Version negotiation is a v2 concern.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun runtime | Server, bunx | ✓ | 1.3.12 | — |
| Chrome 116+ | Side panel WebSocket | ✓ (development browser) | — | Set minimum_chrome_version in manifest |
| @inspatch/shared | Message schemas | ✓ | workspace:* | — |
| chrome.storage.session | Connection state persistence | ✓ (Chrome 102+) | — | — |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:** None

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (v1) | Localhost binding (127.0.0.1) is the primary access control. Token auth deferred to hardening phase. |
| V3 Session Management | No | No user sessions — single-user local tool |
| V4 Access Control | Partially | `hostname: '127.0.0.1'` binding prevents remote access (D-09) |
| V5 Input Validation | Yes | Zod `safeParse()` on ALL incoming WebSocket messages, both server and client side (D-11, D-12) |
| V6 Cryptography | No | Localhost only — no network encryption needed for dev tool |

### Known Threat Patterns for WebSocket + Local Server

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Local process connects to server and sends malicious commands | Spoofing | Bind to 127.0.0.1 (D-09). Future: session token in upgrade handshake. |
| Malformed messages crash server | Denial of Service | Zod validation rejects invalid messages (D-11). Wrap JSON.parse in try/catch. |
| Message flooding from rogue client | Denial of Service | Rate limiting (not in v1 scope). Single serial queue naturally throttles processing (D-14). |
| Extension receives forged server messages | Tampering | Zod validation on client side (D-12). Connection is to known localhost port. |

## Sources

### Primary (HIGH confidence)
- Bun WebSocket API: https://bun.sh/docs/api/websockets — server setup, upgrade pattern, handler API, configuration options
- Bun serve reference: https://bun.com/reference/bun/serve — hostname, port, fetch handler
- Bun bunx docs: https://bun.sh/docs/cli/bunx — bin field, .ts execution
- Chrome Extensions WebSocket tutorial: https://developer.chrome.com/docs/extensions/mv3/tut_websockets — keepalive pattern, Chrome 116+
- Chrome Side Panel API: https://developer.chrome.com/docs/extensions/reference/api/sidePanel — lifetime, persistence

### Secondary (MEDIUM confidence)
- bunx .ts bin publishing: https://www.api2o.com/en/handbook/bun/publish-executable-to-npm-and-bunx — verified pattern for .ts bin entry
- Side panel WebSocket pattern: https://github.com/Ryadel/ClawTalk — real-world MV3 + side panel + WebSocket extension (Feb 2026)
- chrome.storage.session: https://stackoverflow.com/questions/71753770/ — API availability confirmation

### Tertiary (LOW confidence)
- None — all critical claims verified against primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Bun native APIs verified against official docs; existing shared package verified in codebase
- Architecture: HIGH — Side panel WebSocket ownership validated against CP-1 research; Bun.serve() patterns from official docs
- Pitfalls: HIGH — Drawn from verified PITFALLS.md + Bun docs edge cases + Chrome extension messaging known issues
- Server setup (bunx): MEDIUM — .ts bin entry verified for bunx, but npm publish path has known issues

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (30 days — Bun and Chrome APIs are stable)
