# Architecture Research

**Domain:** Chrome Extension Visual Code Editing Tool
**Researched:** 2026-04-13
**Confidence:** HIGH (MV3 patterns well-documented; CLI integration patterns verified with known issues)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CHROME BROWSER                        │
│                                                         │
│  ┌──────────────────┐    chrome.runtime     ┌────────┐  │
│  │  Content Script   │◄────────────────────►│Service │  │
│  │                   │    .sendMessage()     │Worker  │  │
│  │  • Element select │                      │(bg.ts) │  │
│  │  • Fiber traverse │    ┌──────────┐      │        │  │
│  │  • Source Map parse│◄──►│Side Panel│      │  • WS  │  │
│  │  • Screenshot crop│    │ (React)  │      │  conn  │  │
│  └──────────────────┘    │          │      │  • Keep │  │
│          ▲               │  • UI    │      │  alive  │  │
│          │               │  • Input │      │  • Msg  │  │
│  window.postMessage      │  • Status│      │  router │  │
│  (page ↔ isolated world) └──────────┘      └───┬────┘  │
│                                                 │       │
└─────────────────────────────────────────────────┼───────┘
                                                  │
                                          WebSocket (ws://localhost)
                                                  │
┌─────────────────────────────────────────────────┼───────┐
│                LOCAL MACHINE                     │       │
│                                                 ▼       │
│  ┌──────────────────────────────────────────────────┐   │
│  │             WebSocket Server (Node.js)            │   │
│  │                                                   │   │
│  │  • Request validation & routing                   │   │
│  │  • Claude Code CLI orchestration                  │   │
│  │  • Status/result streaming                        │   │
│  │  • Request queue (one-at-a-time)                  │   │
│  └──────────────────┬───────────────────────────────┘   │
│                     │                                    │
│                     │ child_process.spawn()               │
│                     ▼                                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Claude Code CLI                         │   │
│  │                                                   │   │
│  │  claude --print --output-format stream-json       │   │
│  │    --verbose "prompt with context"                │   │
│  │                                                   │   │
│  │  • Reads/writes project source files              │   │
│  │  • Returns structured JSON events                 │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Dev Server (Vite/Next.js/CRA)           │   │
│  │                                                   │
│  │  • Serves app with Source Maps                    │   │
│  │  • Hot-reloads on file changes                    │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With | Trust Level |
|-----------|---------------|-------------------|-------------|
| **Content Script** | Element selection, hover highlighting, React fiber traversal, source map fetching/parsing, screenshot capture (via service worker), DOM inspection | Service Worker (chrome.runtime), Page context (window.postMessage) | Untrusted page data — validate everything |
| **Page-World Script** | Access React fiber tree (`__reactFiber$`), read `_debugSource` / component stacks | Content Script (CustomEvent / window.postMessage) | Runs in page context — fully untrusted |
| **Side Panel (React)** | Element info display, natural language input, status/progress display, change history | Service Worker (chrome.runtime.sendMessage, ports) | Extension context — trusted |
| **Service Worker (Background)** | WebSocket connection to local server, message routing between content script and side panel, connection keepalive, state persistence | Content Script, Side Panel, WebSocket Server | Extension context — trusted, central hub |
| **WebSocket Server** | Request validation, Claude Code CLI orchestration, streaming status/results back, request queuing | Service Worker (WebSocket), Claude Code CLI (child_process) | Local only — trusted |
| **Claude Code CLI** | Source file reading/modification based on prompts with context | WebSocket Server (stdin/stdout) | Local — fully trusted, has file system access |

## Recommended Project Structure

```
inspatch/
├── packages/
│   ├── extension/                # Chrome extension (MV3)
│   │   ├── manifest.json
│   │   ├── src/
│   │   │   ├── background/
│   │   │   │   ├── index.ts          # Service worker entry
│   │   │   │   ├── websocket.ts      # WS connection + keepalive
│   │   │   │   └── router.ts         # Message routing hub
│   │   │   ├── content/
│   │   │   │   ├── index.ts          # Content script entry
│   │   │   │   ├── selector.ts       # Element selection + highlighting
│   │   │   │   ├── fiber.ts          # React fiber traversal (injects page script)
│   │   │   │   ├── sourcemap.ts      # Source map fetch + parse
│   │   │   │   └── screenshot.ts     # Element screenshot capture
│   │   │   ├── page/
│   │   │   │   └── fiber-bridge.ts   # Injected into page world for fiber access
│   │   │   ├── sidepanel/
│   │   │   │   ├── index.html
│   │   │   │   ├── App.tsx           # Side panel React root
│   │   │   │   ├── components/
│   │   │   │   │   ├── ElementInfo.tsx
│   │   │   │   │   ├── ChangeInput.tsx
│   │   │   │   │   └── StatusFeed.tsx
│   │   │   │   └── hooks/
│   │   │   │       └── useExtensionMessaging.ts
│   │   │   └── shared/
│   │   │       ├── messages.ts       # Typed message protocol
│   │   │       ├── types.ts          # Shared types
│   │   │       └── constants.ts
│   │   ├── public/
│   │   │   └── icons/
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   │
│   ├── server/                   # Local WebSocket server
│   │   ├── src/
│   │   │   ├── index.ts              # Server entry + CLI
│   │   │   ├── websocket.ts          # WS server setup
│   │   │   ├── claude.ts             # Claude Code CLI orchestration
│   │   │   ├── prompt.ts             # Prompt template construction
│   │   │   ├── queue.ts              # Request queue (serial execution)
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/                   # Shared between extension and server
│       ├── src/
│       │   ├── protocol.ts           # WebSocket message protocol types
│       │   └── schema.ts             # Zod schemas for validation
│       ├── package.json
│       └── tsconfig.json
│
├── package.json                  # Workspace root (pnpm workspaces)
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

**Rationale:** Monorepo with pnpm workspaces. The `shared` package enforces a single source of truth for the WebSocket protocol between extension and server. Each package has its own build config because the extension needs Vite (for React side panel + content script bundling) while the server uses plain `tsc` or `tsup`.

## Architectural Patterns

### Pattern 1: Typed Message Protocol (Extension Internal)

All inter-context communication uses a discriminated union with exhaustive type checking. This prevents the "generic sendMessage" anti-pattern that causes silent failures.

```typescript
// packages/extension/src/shared/messages.ts

type ContentToBackground =
  | { type: 'ELEMENT_SELECTED'; payload: ElementContext }
  | { type: 'SOURCE_RESOLVED'; payload: SourceLocation }
  | { type: 'SCREENSHOT_READY'; payload: { dataUrl: string } };

type BackgroundToContent =
  | { type: 'START_SELECTION' }
  | { type: 'STOP_SELECTION' }
  | { type: 'HIGHLIGHT_ELEMENT'; payload: { selector: string } };

type PanelToBackground =
  | { type: 'SUBMIT_CHANGE'; payload: { description: string } }
  | { type: 'CANCEL_REQUEST' };

type BackgroundToPanel =
  | { type: 'ELEMENT_CONTEXT'; payload: ElementContext }
  | { type: 'STATUS_UPDATE'; payload: StatusEvent }
  | { type: 'CHANGE_COMPLETE'; payload: ChangeResult }
  | { type: 'ERROR'; payload: { code: string; message: string } };
```

### Pattern 2: WebSocket Protocol (Extension ↔ Server)

Shared between extension and server via the `shared` package. Uses JSON with a `type` discriminator and a `requestId` for correlating streaming responses.

```typescript
// packages/shared/src/protocol.ts

type ClientMessage =
  | { type: 'apply_change'; requestId: string; payload: ChangeRequest }
  | { type: 'cancel'; requestId: string }
  | { type: 'ping' };

type ServerMessage =
  | { type: 'status'; requestId: string; payload: { phase: string; message: string } }
  | { type: 'stream'; requestId: string; payload: { text: string } }
  | { type: 'complete'; requestId: string; payload: ChangeResult }
  | { type: 'error'; requestId: string; payload: { code: string; message: string } }
  | { type: 'pong' };

interface ChangeRequest {
  description: string;           // Natural language change request
  element: {
    tagName: string;
    componentName: string | null;
    className: string;
    computedStyles: Record<string, string>;  // Relevant subset
    boundingRect: DOMRect;
  };
  source: {
    filePath: string;            // Original source file
    line: number;
    column: number;
    framework: 'react' | 'unknown';
  } | null;
  screenshot: string | null;    // Base64 data URL
  pageUrl: string;
}
```

### Pattern 3: Service Worker WebSocket with Keepalive

The service worker owns the WebSocket connection, using a 20-second heartbeat to prevent MV3's 30-second idle termination. Chrome alarms provide a backup reconnection mechanism.

```typescript
// packages/extension/src/background/websocket.ts

const WS_URL = 'ws://localhost:9847';
const KEEPALIVE_INTERVAL_MS = 20_000;

let ws: WebSocket | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    keepaliveTimer = setInterval(() => {
      ws?.send(JSON.stringify({ type: 'ping' }));
    }, KEEPALIVE_INTERVAL_MS);
  };

  ws.onclose = () => {
    cleanup();
    // Reconnect via chrome.alarms (survives worker restart)
    chrome.alarms.create('ws-reconnect', { delayInMinutes: 0.1 });
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    routeServerMessage(msg);
  };
}

function cleanup() {
  if (keepaliveTimer) clearInterval(keepaliveTimer);
  keepaliveTimer = null;
  ws = null;
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ws-reconnect' && !ws) connect();
});
```

### Pattern 4: Page-World Script Injection for Fiber Access

Content scripts run in an isolated world and cannot access page JavaScript globals like `__reactFiber$`. The solution: inject a small script into the page's main world that reads fiber data and communicates back via `CustomEvent`.

```typescript
// packages/extension/src/content/fiber.ts (content script side)

function injectFiberBridge() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('page/fiber-bridge.js');
  script.dataset.extensionId = chrome.runtime.id;
  document.documentElement.appendChild(script);
  script.onload = () => script.remove();
}

window.addEventListener('__inspatch_fiber_result', ((e: CustomEvent) => {
  const { componentName, debugSource } = e.detail;
  // Forward to background
  chrome.runtime.sendMessage({
    type: 'SOURCE_RESOLVED',
    payload: { componentName, debugSource }
  });
}) as EventListener);

// packages/extension/src/page/fiber-bridge.ts (page world)

document.addEventListener('__inspatch_fiber_query', ((e: CustomEvent) => {
  const { selector } = e.detail;
  const el = document.querySelector(selector);
  if (!el) return;

  const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  if (!fiberKey) return;

  let fiber = (el as any)[fiberKey];
  // Walk up to find the nearest user component (skip host fibers)
  while (fiber) {
    if (typeof fiber.type === 'function' || typeof fiber.type === 'object') {
      const name = fiber.type?.displayName || fiber.type?.name || null;
      const source = fiber._debugSource || null;
      window.dispatchEvent(new CustomEvent('__inspatch_fiber_result', {
        detail: { componentName: name, debugSource: source }
      }));
      return;
    }
    fiber = fiber.return;
  }
}) as EventListener);
```

### Pattern 5: Source Map Resolution Chain

Source maps are fetched and parsed in the content script context (has network access to localhost). Uses `@jridgewell/trace-mapping` (no WASM dependency, 20x less memory than `source-map`).

```typescript
// packages/extension/src/content/sourcemap.ts

import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

const sourceMapCache = new Map<string, TraceMap>();

async function resolveOriginalPosition(
  generatedUrl: string,
  line: number,
  column: number
): Promise<SourceLocation | null> {
  const traceMap = await getOrFetchSourceMap(generatedUrl);
  if (!traceMap) return null;

  const pos = originalPositionFor(traceMap, { line, column });
  if (!pos.source) return null;

  return {
    filePath: pos.source,
    line: pos.line!,
    column: pos.column!,
  };
}

async function getOrFetchSourceMap(url: string): Promise<TraceMap | null> {
  if (sourceMapCache.has(url)) return sourceMapCache.get(url)!;

  // Fetch the generated file to find //# sourceMappingURL
  const response = await fetch(url);
  const text = await response.text();
  const match = text.match(/\/\/[#@]\s*sourceMappingURL=(.+)$/m);
  if (!match) return null;

  const mapUrl = new URL(match[1], url).href;
  const mapResponse = await fetch(mapUrl);
  const rawMap = await mapResponse.json();

  const traceMap = new TraceMap(rawMap);
  sourceMapCache.set(url, traceMap);
  return traceMap;
}
```

### Pattern 6: Claude Code CLI Orchestration

Spawn Claude Code with `--print --output-format stream-json --verbose` for streaming NDJSON events. Pass prompt as a CLI argument (not stdin) to avoid the known stdin-close issue. Queue requests serially since Claude Code operates on the filesystem.

```typescript
// packages/server/src/claude.ts

import { spawn } from 'child_process';

interface ClaudeEvent {
  type: 'init' | 'assistant' | 'result' | 'error';
  [key: string]: unknown;
}

function invokeClaudeCode(
  prompt: string,
  cwd: string,
  onEvent: (event: ClaudeEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      prompt,
    ], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    });

    let buffer = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop()!; // Keep incomplete line in buffer
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          onEvent(JSON.parse(line));
        } catch { /* skip malformed lines */ }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      onEvent({ type: 'error', message: chunk.toString() });
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Claude Code exited with code ${code}`));
    });
  });
}
```

### Pattern 7: Element Screenshot via captureVisibleTab + Crop

Use Chrome's native `chrome.tabs.captureVisibleTab()` (fast, no library dependency) and crop to element bounds using OffscreenCanvas in the service worker.

```typescript
// packages/extension/src/background/screenshot.ts

async function captureElement(
  tabId: number,
  rect: { x: number; y: number; width: number; height: number }
): Promise<string> {
  const dataUrl = await chrome.tabs.captureVisibleTab(
    undefined, { format: 'png' }
  );

  // Crop in offscreen document (service workers lack Canvas)
  const response = await chrome.runtime.sendMessage({
    type: 'CROP_IMAGE',
    payload: { dataUrl, rect }
  });
  return response.croppedDataUrl;
}
```

The cropping runs in an offscreen document because service workers have no Canvas API. The offscreen document is created on-demand and destroyed after use.

## Data Flow

### Request Flow: User Click → Code Change

```
1. USER clicks element on page
   │
2. Content Script: Element selected
   ├── Compute bounding rect, tag, classes, computed styles
   ├── Inject page-world script → traverse React fiber tree
   │   └── Returns: componentName, _debugSource (fileName, line, col)
   ├── Fetch + parse source map for generated JS file
   │   └── Returns: original filePath, line, column
   └── Send ELEMENT_SELECTED to Service Worker
       │
3. Service Worker: Route element context
   ├── Forward to Side Panel as ELEMENT_CONTEXT
   └── Request screenshot via captureVisibleTab + crop
       │
4. Side Panel: Display element info
   ├── Show component name, file path, line number
   ├── Show element screenshot thumbnail
   └── USER types natural language change description → SUBMIT_CHANGE
       │
5. Service Worker: Package and send
   ├── Build ChangeRequest with all context
   └── Send over WebSocket to local server
       │
6. WebSocket Server: Orchestrate
   ├── Validate request schema
   ├── Queue if another request is in-flight
   ├── Construct prompt with full context (component, file, styles, screenshot)
   ├── spawn('claude', ['--print', '--output-format', 'stream-json', ...])
   ├── Stream status events back over WebSocket
   │   └── Service Worker → Side Panel: STATUS_UPDATE (streaming)
   └── On completion: send CHANGE_COMPLETE
       │
7. Dev Server: Hot-reload triggers automatically
   └── USER sees the change in browser
```

### State Management

**Extension state** is minimal and ephemeral:
- **Content Script:** Current selection state (highlighted element, parsed source map cache). Survives as long as tab is open.
- **Service Worker:** WebSocket connection state, pending request ID. Persisted to `chrome.storage.session` to survive worker restarts.
- **Side Panel:** Current element context, request status, change history for current session. React state (useState/useReducer), lost on panel close.

**Server state** is transient:
- Active WebSocket connections (Map of connection → metadata)
- Current in-flight Claude Code process (for cancellation)
- Request queue (in-memory, lost on server restart — acceptable for a dev tool)

There is no database. No persistent storage on the server side. The extension uses `chrome.storage.session` for service worker resilience only.

## Anti-Patterns

### Anti-Pattern 1: Content Script as Logic Hub
**What:** Putting business logic, WebSocket connections, or prompt construction in the content script.
**Why bad:** Content scripts reload on every page navigation, run in an untrusted context, and cannot access chrome.storage.session. They also have CSP restrictions that prevent WebSocket connections to arbitrary hosts.
**Instead:** Content scripts should be thin data collectors. All routing, connection management, and logic flows through the service worker.

### Anti-Pattern 2: Persistent Background Page Mentality
**What:** Storing state in service worker global variables, using setTimeout for long operations, assuming the worker stays alive.
**Why bad:** MV3 service workers terminate after 30s of inactivity. All in-memory state is lost.
**Instead:** Persist critical state to `chrome.storage.session`. Use `chrome.alarms` for delayed/periodic work. Design for wake-from-cold-start.

### Anti-Pattern 3: Bidirectional Port for Everything
**What:** Using `chrome.runtime.connect()` long-lived ports for all messaging between contexts.
**Why bad:** Ports keep the service worker alive unnecessarily, and port disconnection handling is error-prone. Simple request/response doesn't need a persistent channel.
**Instead:** Use one-time `sendMessage()` for request/response patterns. Reserve ports only for continuous streaming (e.g., status updates from server during a change operation).

### Anti-Pattern 4: Parsing Source Maps on the Server
**What:** Sending generated JS file URLs to the server for source map resolution.
**Why bad:** The server doesn't have access to the dev server's files via HTTP. The content script is already in the browser with direct fetch access to the dev server.
**Instead:** Parse source maps in the content script using `@jridgewell/trace-mapping`. Send resolved file paths to the server.

### Anti-Pattern 5: Direct `__reactFiber$` Access from Content Script
**What:** Trying to read `__reactFiber$` properties directly from the content script.
**Why bad:** Content scripts run in an isolated world with a separate JavaScript heap. Page globals like React internals are invisible.
**Instead:** Inject a page-world script that reads fiber data and communicates back via `CustomEvent` or `window.postMessage`.

### Anti-Pattern 6: Claude Code via stdin Pipe
**What:** Writing prompts to Claude Code's stdin via `proc.stdin.write()`.
**Why bad:** Known Node.js issue — Claude Code waits for stdin to close before processing. Easy to forget `stdin.end()`, causing hangs.
**Instead:** Pass the prompt as a CLI argument: `spawn('claude', ['--print', prompt])`. Set stdin to `'ignore'`.

## Integration Points

### Extension ↔ Page Context (Fiber Bridge)

| Aspect | Detail |
|--------|--------|
| **Direction** | Bidirectional: content script dispatches query events, page script dispatches result events |
| **Mechanism** | `CustomEvent` on `document` / `window` (window.postMessage also works but CustomEvent is cleaner) |
| **Security** | Validate event.detail structure. Use unique event names prefixed with `__inspatch_` to avoid collisions |
| **Boundary** | Content script isolated world ↔ Page main world |
| **Injected via** | `chrome.scripting.executeScript({ world: 'MAIN' })` or `<script>` tag with `chrome.runtime.getURL()` |
| **Build note** | `fiber-bridge.ts` must be bundled separately and listed in `web_accessible_resources` |

### Extension ↔ Local Server (WebSocket)

| Aspect | Detail |
|--------|--------|
| **Direction** | Bidirectional: client sends requests, server streams status/results |
| **Protocol** | WebSocket (`ws://localhost:9847`), JSON text frames |
| **Owned by** | Service worker (background) exclusively |
| **Keepalive** | 20s ping interval from client; server responds with pong |
| **Reconnection** | Exponential backoff (1s → 30s cap), triggered by `chrome.alarms` |
| **Shared types** | `packages/shared/src/protocol.ts` — single source of truth for message shapes |
| **Request correlation** | `requestId` field ties streaming status/result messages to the originating request |

### Server ↔ Claude Code CLI

| Aspect | Detail |
|--------|--------|
| **Direction** | Server → CLI (prompt as argument), CLI → Server (stdout NDJSON stream) |
| **Mechanism** | `child_process.spawn()` with `stdio: ['ignore', 'pipe', 'pipe']` |
| **Flags** | `--print --output-format stream-json --verbose` |
| **Concurrency** | Serial queue — one Claude Code invocation at a time (file system safety) |
| **Cancellation** | `AbortController` signal passed to spawn; server sends SIGTERM on cancel |
| **CWD** | Must be set to the project root so Claude Code can find and modify source files |
| **Error handling** | Non-zero exit code → error event to client. stderr captured for diagnostics |

## Build Order (Dependency Chain)

The components have a clear dependency ordering for incremental development:

```
Phase 1: shared protocol types (no runtime deps — pure TypeScript types)
    ↓
Phase 2: server skeleton (WebSocket + echo) — can test with any WS client
    ↓
Phase 3: extension skeleton (manifest, service worker, content script injection, side panel shell)
    ↓
Phase 4: element selection + highlighting (content script, no React fiber yet)
    ↓
Phase 5: service worker ↔ content script ↔ side panel messaging
    ↓
Phase 6: WebSocket connection (service worker ↔ server) with keepalive
    ↓
Phase 7: React fiber traversal (page-world injection, component name detection)
    ↓
Phase 8: source map parsing (fetch + trace-mapping in content script)
    ↓
Phase 9: screenshot capture (captureVisibleTab + crop via offscreen document)
    ↓
Phase 10: Claude Code CLI integration (server-side spawn + streaming)
    ↓
Phase 11: prompt construction (assembling context into effective prompts)
    ↓
Phase 12: end-to-end flow (click element → see code change → hot reload)
```

**Critical path:** Phases 1-6 form the communication backbone. Nothing useful happens without the messaging pipeline. Phases 7-9 are independent and can be parallelized. Phases 10-11 can start once the server skeleton exists (Phase 2).

## Scalability Considerations

| Concern | Single Developer (v1) | Team Use (v2+) |
|---------|----------------------|-----------------|
| **Concurrency** | Serial queue is fine — one person, one change at a time | Need request queue with user identification |
| **Server discovery** | Hardcoded `localhost:9847` | Port discovery via lock file or config |
| **Project root** | Server started in project root manually | Auto-detect from active tab URL / workspace config |
| **Multiple projects** | One server per project | Multi-project routing or per-project server instances |

## Sources

- Chrome MV3 Service Workers: https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets
- Chrome Message Passing: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
- Chrome Side Panel API: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- `@jridgewell/trace-mapping`: https://github.com/jridgewell/sourcemaps/tree/main/packages/trace-mapping (archived original: https://github.com/jridgewell/trace-mapping)
- Claude Code CLI Reference: https://code.claude.com/docs/en/cli-reference
- Claude Code Node.js spawn issue: https://stackoverflow.com/questions/79826420/calling-claude-cli-as-a-child-process-yields-no-output
- Claude Code stream-json format: https://gist.github.com/JacobFV/2c4a75bc6a835d2c1f6c863cfcbdfa5a
- React Fiber `__reactFiber$` access: https://stackoverflow.com/questions/78137532/struggling-with-reactfiber-property-react-attaches-to-elements-inside-its-v
- React DevTools source detection refactor: https://github.com/facebook/react/pull/28351
- `chrome.tabs.captureVisibleTab` cropping: https://stackoverflow.com/questions/38181137/how-can-i-take-screenshot-of-some-specific-area-using-javascript-in-chrome-exten
- Production MV3 extension structure: https://bizarro.dev.to/hewitt/how-to-structure-a-production-ready-chrome-extension-manifest-v3-2hlf
- Chrome extension monorepo with Turborepo: https://www.blog.brightcoding.dev/2025/08/04/building-modern-chrome-extensions-at-lightning-speed
