# Stack Research

**Domain:** Chrome Extension Visual Code Editing Tool
**Researched:** 2026-04-13
**Overall Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| WXT | 0.20.20 | Extension framework | Vite-based, file-based entrypoints auto-generate manifest, HMR for all extension contexts, MV3 native. Nuxt-inspired DX with auto-imports. Supports React out of the box. 9.5K GitHub stars, actively maintained (Vite 8 support shipped). |
| React | 19.0.4 | Sidebar panel UI | Project targets React apps — using React for the extension UI means one language/paradigm. Mature ecosystem, ref-as-prop eliminates forwardRef boilerplate. |
| TypeScript | 5.7+ | Type safety across all codebases | Extension ↔ server message contracts benefit enormously from shared types. WXT has first-class TS support. |
| Tailwind CSS | 4.2 | Sidebar styling | CSS-first config via `@theme`, Rust-based Oxide engine (3–100x faster builds), automatic content detection. Pairs naturally with WXT's Vite pipeline. |
| Node.js | 22 LTS | Local middleware server | Active LTS through Oct 2027. Native `fetch`, `WebSocket` client, performant `child_process` for CLI invocation. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ws | 8.20.0 | WebSocket server (Node.js side) | Server that receives extension connections. Zero dependencies, 167M weekly downloads, battle-tested. |
| source-map-js | 1.2.1 | Source map parsing | Resolving generated DOM positions to original source file/line. Synchronous API — no WASM init needed in content script context. Pure JS, 82M weekly downloads. |
| Zod | 4.3.6 | Message schema validation | Validate WebSocket messages between extension and server. 2KB core, TypeScript-first, 14.7x faster string parsing in v4. Shared schemas = type-safe contract. |
| nanoid | 5.1+ | Message/request IDs | Generate unique IDs for WebSocket request-response correlation. Tiny, URL-safe, cryptographically strong. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| WXT CLI | Extension dev server, build, zip | `wxt dev` for HMR, `wxt build` for production, `wxt zip` for store submission |
| Vite 8 | Bundler (via WXT) | Rolldown integration for 10–30x faster production builds. WXT 0.20.20 has explicit Vite 8 support. |
| pnpm | Package manager | Workspace support for monorepo (extension + server packages), strict dependency resolution, disk-efficient |
| ESLint 10 | Linting | WXT 0.20.19+ lists ESLint 10 as supported |
| @anthropic-ai/claude-code | Claude Code CLI | Headless mode via `-p` flag, JSON output via `--output-format json`, tool pre-approval via `--allowedTools` |

## Architecture-Specific Stack Decisions

### Chrome Extension (WXT)

**Entrypoints structure (WXT file-based convention):**

```
extension/
├── entrypoints/
│   ├── background.ts          # Service worker — WebSocket client, message router
│   ├── content.ts             # Content script — DOM inspection, highlighting, source map parsing
│   ├── content/inject.ts      # Main-world script — React fiber access (injected via content script)
│   ├── sidepanel/             # Side panel UI
│   │   ├── index.html
│   │   └── App.tsx
│   └── popup/                 # Optional popup (extension icon click)
│       ├── index.html
│       └── App.tsx
├── components/                # Shared React components
├── lib/                       # Shared utilities
├── public/                    # Static assets (icons)
└── wxt.config.ts
```

**Why WXT over Plasmo:** WXT uses Vite (industry-standard), Plasmo uses a custom Parcel fork. Vite 8 + Rolldown is the clear trajectory for frontend tooling in 2026. WXT's file-based entrypoints are more transparent than Plasmo's magic — critical for a tool that needs precise control over content scripts and injected scripts. Plasmo's CSUI (Content Script UI) is elegant but opinionated; WXT gives the same capability with more control.

**Why WXT over CRXJS:** CRXJS is a Vite plugin (minimal abstraction) but development has slowed in 2025–2026 and it only targets Chrome/Edge. WXT provides cross-browser support and richer DX without heavy abstraction.

### Source Map Resolution

**Why source-map-js over mozilla/source-map:**
- `source-map-js` has a synchronous API — `new SourceMapConsumer(rawMap)` + `consumer.originalPositionFor({line, column})`. No WASM init, no async/await ceremony.
- `mozilla/source-map` v0.7+ requires `SourceMapConsumer.initialize()` with a WASM binary URL, which is awkward in extension content script contexts where file URLs and CSP intersect.
- Performance is comparable for our use case (we parse one source map at a time, not thousands).

**Source map fetching pattern:**
1. Content script reads `//# sourceMappingURL=` from loaded scripts
2. Fetch the `.map` file from the dev server (relative URL resolution)
3. Parse with `source-map-js` to resolve `{line, column}` → `{source, line, column, name}`

### Element Screenshot Capture

**Use `chrome.tabs.captureVisibleTab()` + Canvas cropping.** This is Chrome's native API — no library needed.

1. Content script sends element bounding rect to background script
2. Background calls `chrome.tabs.captureVisibleTab(null, { format: 'png' })`
3. Background loads image onto OffscreenCanvas, crops to element rect
4. Returns cropped data URL

**Why not html2canvas/dom-to-image:** These libraries re-render the DOM to canvas, which frequently misses CSS features (backdrop-filter, clipping, pseudo-elements, Shadow DOM). `captureVisibleTab` captures what's actually on screen — pixel-perfect.

**Limitation:** Only captures the visible viewport. Elements scrolled off-screen need a scroll-and-stitch approach for full capture.

### React Component Detection

**Script injection into the page's main world** is required. Content scripts run in an isolated world and cannot see React's internal properties.

```typescript
// content.ts — inject into main world
const script = document.createElement('script');
script.src = chrome.runtime.getURL('/inject.js');
script.onload = () => script.remove();
document.documentElement.appendChild(script);
```

In the injected script, traverse the fiber tree:
```typescript
function getReactFiber(node: Element) {
  const key = Object.keys(node).find(k => k.startsWith('__reactFiber$'));
  return key ? (node as any)[key] : null;
}

function getComponentName(fiber: any): string | null {
  while (fiber) {
    if (typeof fiber.type === 'function') {
      return fiber.type.displayName || fiber.type.name || null;
    }
    fiber = fiber.return;
  }
  return null;
}
```

Communication between injected script ↔ content script uses `window.postMessage` with a unique channel identifier.

### WebSocket Communication

**Architecture:** Extension background (service worker) → WebSocket → Local Node.js server

**Service worker keepalive:** Chrome 116+ keeps service workers alive while a WebSocket exchanges messages within 30-second windows. Send ping frames every 20 seconds.

**Message protocol with Zod:**
```typescript
// Shared between extension and server
const ChangeRequest = z.object({
  id: z.string(),
  type: z.literal('change_request'),
  filePath: z.string(),
  line: z.number(),
  column: z.number(),
  componentName: z.string().optional(),
  currentStyles: z.record(z.string()).optional(),
  screenshot: z.string().optional(),   // base64 data URL
  userPrompt: z.string(),
});
```

### Local Server + Claude Code CLI

**Minimal Node.js server** with `ws` for WebSocket and `child_process.spawn` for CLI invocation:

```typescript
import { spawn } from 'node:child_process';

function invokeClaudeCode(prompt: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', [
      '-p', prompt,
      '--output-format', 'json',
      '--allowedTools', 'Read,Edit,Write,Bash',
    ], { cwd });

    let stdout = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { /* log or stream to extension */ });
    proc.on('close', (code) => {
      code === 0 ? resolve(stdout) : reject(new Error(`Exit ${code}`));
    });
  });
}
```

**Why spawn over exec:** `exec` buffers all output (memory risk on large responses). `spawn` streams stdout/stderr, allowing real-time status updates back to the extension via WebSocket.

## Installation

```bash
# Extension (WXT + React + Tailwind)
pnpm create wxt@latest extension --template react
cd extension
pnpm add react react-dom source-map-js zod nanoid
pnpm add -D @types/react @types/react-dom tailwindcss @tailwindcss/vite

# Local server
cd ../server
pnpm init
pnpm add ws zod nanoid
pnpm add -D @types/ws typescript tsx
```

**Monorepo structure:**
```
inspatch/
├── extension/           # WXT Chrome extension
├── server/              # Node.js WebSocket + CLI orchestrator
├── shared/              # Shared Zod schemas, types
├── pnpm-workspace.yaml
└── package.json
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Extension framework | WXT | Plasmo | Custom Parcel fork, heavier abstraction, less transparent. CSUI is nice but WXT + manual Shadow DOM gives same result with more control. |
| Extension framework | WXT | CRXJS | Development slowed, Chrome/Edge only, no built-in multi-browser support. |
| Extension framework | WXT | Manual Vite | Too much boilerplate: manual manifest, no auto-reload for content scripts, no entrypoint conventions. |
| Source maps | source-map-js | mozilla/source-map | Requires async WASM init, heavier for extension context. Sync API of source-map-js is simpler and sufficient. |
| WebSocket (server) | ws | Socket.IO | Socket.IO adds protocol overhead, fallback transports we don't need (we control both endpoints on localhost), and 10x bundle size. |
| WebSocket (server) | ws | µWebSockets.js | Overkill for single-client localhost. ws is simpler, pure JS, zero deps. |
| Screenshot | captureVisibleTab | html2canvas | Re-renders DOM to canvas — misses CSS features, slower, inaccurate for complex pages. |
| Screenshot | captureVisibleTab | dom-to-image | Same re-rendering approach, similar accuracy problems. |
| Styling | Tailwind CSS v4 | CSS Modules | No utility classes, slower iteration for UI-heavy sidebar. Tailwind + Vite is zero-config in 2026. |
| Styling | Tailwind CSS v4 | Styled Components | Runtime CSS-in-JS is deprecated pattern in React 19 era. Tailwind is compile-time. |
| Schema validation | Zod | io-ts | More verbose, fp-ts dependency, smaller ecosystem. Zod v4 is faster and more ergonomic. |
| Server framework | Raw Node.js + ws | Express + ws | Express adds unnecessary HTTP routing overhead. Our server is WebSocket-only (or nearly). |
| Server framework | Raw Node.js + ws | Fastify | Same reasoning — WebSocket-first, not HTTP-first. |
| Component library | shadcn/ui (optional) | Radix + custom | shadcn/ui wraps Radix with Tailwind — get both for free if we want pre-built components later. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Manifest V2 | Deprecated and enforced off Chrome Web Store as of 2026 | Manifest V3 (WXT handles this) |
| Persistent background pages | Not available in MV3, replaced by service workers | Event-driven service worker via WXT `background.ts` |
| `eval()` / remote code execution | Banned in MV3 CSP | Bundle all code at build time (WXT does this) |
| `webRequestBlocking` | Removed in MV3 | `declarativeNetRequest` (not needed for this project) |
| Socket.IO | Protocol overhead, unnecessary fallback transports for localhost | Native WebSocket (client) + ws (server) |
| html2canvas | Inaccurate DOM re-rendering, misses modern CSS | `chrome.tabs.captureVisibleTab()` + Canvas crop |
| mozilla/source-map 0.7+ | WASM dependency, async-only API, complex init in extension context | source-map-js (sync, pure JS, same accuracy) |
| Electron / standalone app | Heavy, unnecessary when Chrome extension + local server achieves the same | Chrome extension + Node.js server |
| `chrome.storage.local` for large data | 10MB limit, not designed for screenshots or source maps | Keep large data in memory or pass via WebSocket (ephemeral) |
| `window.localStorage` in content scripts | Shared with the inspected page, no isolation | `chrome.storage.session` for extension-scoped ephemeral state |
| `child_process.exec` for Claude CLI | Buffers entire stdout in memory | `child_process.spawn` for streaming output |
| Tailwind CSS v3 | Legacy config system, slower builds, no Oxide engine | Tailwind CSS v4.2 with CSS-first config |
| npm / yarn classic | No workspace support (npm) or phantom dependencies (yarn) | pnpm for strict resolution and workspace support |

## Chrome Extension Permissions Required

```jsonc
{
  "manifest_version": 3,
  "permissions": [
    "activeTab",       // captureVisibleTab, content script injection
    "sidePanel",       // Side panel API
    "storage"          // chrome.storage.session for ephemeral state
  ],
  "host_permissions": [
    "http://localhost:*/*"  // Dev server access for source maps + WebSocket
  ],
  "minimum_chrome_version": "116"  // Service worker WebSocket keepalive support
}
```

## Version Confidence

| Technology | Version | Confidence | Verification |
|------------|---------|------------|--------------|
| WXT | 0.20.20 | HIGH | npm registry, GitHub releases (March 2026) |
| React | 19.0.4 | HIGH | npm registry, GitHub releases (January 2026) |
| Tailwind CSS | 4.2.0 | HIGH | Official blog post (February 2026) |
| ws | 8.20.0 | HIGH | npm registry (March 2026) |
| source-map-js | 1.2.1 | HIGH | npm registry (82M weekly downloads) |
| Zod | 4.3.6 | HIGH | npm registry (January 2026) |
| Node.js | 22 LTS | HIGH | Official release schedule |
| Chrome Side Panel API | Stable (Chrome 114+) | HIGH | Chrome for Developers docs |
| Chrome captureVisibleTab | Stable | HIGH | Chrome Extensions API docs |
| Service Worker WebSocket keepalive | Chrome 116+ | HIGH | Chrome for Developers tutorial |

## Sources

- WXT Official Docs: https://wxt.dev — framework features, file-based entrypoints, Vite 8 support
- WXT GitHub: https://github.com/wxt-dev/wxt — v0.20.20 changelog, 9.5K stars
- Chrome Extensions MV3 Docs: https://developer.chrome.com/docs/extensions/mv3
- Chrome Side Panel API: https://developer.chrome.com/docs/extensions/reference/sidePanel
- Chrome WebSocket in Service Workers: https://developer.chrome.com/docs/extensions/mv3/tut_websockets
- source-map-js npm: https://www.npmjs.com/package/source-map-js — sync API, 82M downloads
- ws npm: https://www.npmjs.com/package/ws — v8.20.0, 167M downloads
- Zod v4 Release Notes: https://v4.zod.dev/v4 — performance benchmarks
- Claude Code Headless Docs: https://code.claude.com/docs/en/headless — `-p` flag, `--output-format json`
- React Fiber Access: Stack Overflow — `__reactFiber$` key pattern, main-world script injection
- Tailwind CSS v4.2 Release: https://www.infoq.com/news/2026/04/tailwind-css-4-2-webpack/
- WXT vs Plasmo vs CRXJS Comparison: https://trybuildpilot.com/649-wxt-vs-plasmo-vs-crxjs-2026
