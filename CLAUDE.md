<!-- GSD:project-start source:PROJECT.md -->
## Project

**Inspatch**

A Chrome extension development tool that lets developers visually select elements on locally-served web pages, describe desired changes in natural language, and have those changes automatically applied to the source code via Claude Code CLI. Inspatch bridges the gap between what you see in the browser and the source code that produces it — point, describe, done.

**Core Value:** Developers can click any element on their local dev server page, describe what they want changed in plain language, and see the source code updated automatically — eliminating the "find the right file and line" friction entirely.

### Constraints

- **Platform**: Chrome extension (Manifest V3) — Chrome Web Store compatibility
- **Source Map dependency**: Requires dev server to generate accessible Source Maps (most modern tools do by default)
- **Local only**: Extension communicates only with localhost — no external network calls
- **Claude Code CLI**: Requires Claude Code to be installed and authenticated on the developer's machine
- **React focus**: v1 component detection targets React's fiber tree and JSX patterns
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

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
### Source Map Resolution
- `source-map-js` has a synchronous API — `new SourceMapConsumer(rawMap)` + `consumer.originalPositionFor({line, column})`. No WASM init, no async/await ceremony.
- `mozilla/source-map` v0.7+ requires `SourceMapConsumer.initialize()` with a WASM binary URL, which is awkward in extension content script contexts where file URLs and CSP intersect.
- Performance is comparable for our use case (we parse one source map at a time, not thousands).
### Element Screenshot Capture
### React Component Detection
### WebSocket Communication
### Local Server + Claude Code CLI
## Installation
# Extension (WXT + React + Tailwind)
# Local server
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
