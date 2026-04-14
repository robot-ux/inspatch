# Project Research Summary

**Project:** Inspatch
**Domain:** Chrome Extension Visual Code Editing Tool
**Researched:** 2026-04-13
**Confidence:** HIGH

## Executive Summary

Inspatch is a Chrome extension that bridges the visual browser experience with source code editing — developers click an element on their local dev server, describe a change in natural language, and Claude Code CLI modifies the source files automatically. The domain is well-explored: LocatorJS, Retune, Layrr, and Cursor Visual Editor all address pieces of this workflow, but none deliver the full click-to-change loop as a lightweight Chrome extension without IDE lock-in or layout code changes. The recommended approach is a three-component architecture — Chrome Extension (MV3 via WXT), local Node.js WebSocket server, and Claude Code CLI — connected by a typed message protocol with shared Zod schemas in a pnpm monorepo.

The stack is modern and well-supported: WXT 0.20.20 provides Vite 8-based extension development with HMR across all contexts, React 19 powers the sidebar panel, and source-map-js handles Source Map resolution without WASM dependencies. The critical technical challenges are (1) MV3 service worker lifecycle management — WebSocket connections die after 30 seconds of inactivity without keepalive, (2) React fiber tree access requiring main-world script injection across the Chrome isolated world boundary, and (3) reliable Source Map resolution across Vite, Next.js, and CRA bundler variations. All three have documented solutions but demand careful upfront architecture decisions.

The key risk is integration complexity: six distinct execution contexts (content script, page-world script, side panel, service worker, WebSocket server, Claude Code CLI) must exchange typed messages reliably. Mitigate this by establishing the shared protocol and messaging backbone first, then layering feature-specific capabilities on top. Source Map resolution and React fiber detection are the highest-risk technical areas and should be validated early with cross-bundler testing.

## Key Findings

### Recommended Stack

The stack centers on WXT 0.20.20 as the extension framework — it provides file-based entrypoints that auto-generate the MV3 manifest, HMR for content scripts and service workers, and first-class Vite 8 integration. This beats Plasmo (custom Parcel fork, heavier abstraction) and CRXJS (slowed development, Chrome-only). See [STACK.md](STACK.md) for full comparison.

**Core technologies:**
- **WXT 0.20.20**: Extension framework — Vite 8-based, file-based entrypoints, MV3 native, HMR across all contexts
- **React 19.0.4**: Sidebar panel UI — same paradigm as target apps, mature ecosystem
- **TypeScript 5.7+**: Type safety — shared types enforce extension↔server message contracts
- **Tailwind CSS 4.2**: Sidebar styling — CSS-first config, Oxide engine, zero-config with Vite
- **Node.js 22 LTS**: Local server — native fetch, WebSocket client, child_process for CLI
- **ws 8.20.0**: WebSocket server — zero dependencies, battle-tested, sufficient for single-client localhost
- **source-map-js 1.2.1**: Source map parsing — synchronous API, no WASM, works cleanly in content script context
- **Zod 4.3.6**: Schema validation — shared schemas between extension and server, TypeScript-first

**Monorepo structure:** `packages/extension` + `packages/server` + `packages/shared` via pnpm workspaces.

### Expected Features

Research identified 8 table-stakes features, 8 differentiators, and 8 anti-features across 12 competitor tools. See [FEATURES.md](FEATURES.md) for full analysis.

**Must have (table stakes):**
- Element selection with visual highlighting (hover overlay, Alt+Click)
- Source Map-based source file resolution (no Babel plugin, React 19 compatible)
- React fiber tree traversal (component names, parent chain)
- Sidebar panel (element info, natural language input, processing status)
- WebSocket communication with real-time status streaming
- Claude Code CLI integration (the core change-application mechanism)
- Screenshot capture for visual AI context
- Hot-reload detection for change confirmation

**Should have (differentiators):**
- Natural language → source code changes (core value prop, what competitors partially address)
- Source Map resolution without build plugins (key advantage over LocatorJS/click-to-component, which broke with React 19)
- Structured context assembly (component + file + styles + screenshot → high-quality AI output)
- Zero-config Chrome extension (vs. Retune's layout code, Cursor's IDE, Layrr's CLI)

**Defer (v2+):**
- Multi-framework support (Vue, Svelte, Angular)
- Area select / drag-box region selection
- Reference image comparison
- Design token awareness

### Architecture Approach

The system is a six-component pipeline spanning two trust boundaries (browser ↔ local machine). The content script collects DOM and React fiber data in the browser. The service worker acts as the central message hub and WebSocket owner. The side panel provides the React-based UI. The local WebSocket server orchestrates Claude Code CLI invocations and streams status back. All inter-component messaging uses discriminated union types with Zod validation. See [ARCHITECTURE.md](ARCHITECTURE.md) for full patterns.

**Major components:**
1. **Content Script** — Element selection, highlighting, React fiber injection, source map parsing, screenshot coordination
2. **Page-World Script** — Injected into main world for React `__reactFiber$` access (content scripts can't see page globals)
3. **Side Panel (React)** — Element info display, natural language input, streaming status feed
4. **Service Worker** — WebSocket connection owner, message router between content script and side panel, keepalive management
5. **WebSocket Server (Node.js)** — Request validation, Claude Code CLI orchestration, serial request queue, status streaming
6. **Claude Code CLI** — Source file modification via `--print --output-format stream-json` with structured prompts

### Critical Pitfalls

Top 5 pitfalls from [PITFALLS.md](PITFALLS.md), ordered by project impact:

1. **Service worker termination kills WebSocket mid-operation (CP-1)** — Chrome terminates MV3 service workers after 30s idle. Use 20-second keepalive ping; persist in-flight state to `chrome.storage.session`; use `chrome.alarms` for reconnection. This is an architecture-level decision that cannot be retrofitted.
2. **Content script cannot access React fiber tree (CP-2)** — Isolated world prevents seeing `__reactFiber$` properties. Inject a main-world script via `chrome.scripting.executeScript({ world: 'MAIN' })` and bridge data back via `CustomEvent`. Non-negotiable for React component detection.
3. **Source maps not accessible from extension context (CP-3)** — CORS/CSP issues when fetching `.map` files. Fetch from content script (runs in page origin context); require `host_permissions` for `http://localhost:*/*`; handle both inline and external maps.
4. **Element overlay blocks page interaction (CP-5)** — Highlight div intercepts mouse events. Use `pointer-events: none` on overlay, `document.elementFromPoint()` from document-level listener, and Shadow DOM to prevent CSS conflicts.
5. **Side panel open() fails outside user gesture (CP-6)** — Gesture context expires in ~1ms. Use `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` to bypass the gesture requirement entirely.

## Implications for Roadmap

Based on combined research, the suggested phase structure follows the dependency chain identified in ARCHITECTURE.md and addresses pitfalls front-loaded by PITFALLS.md. The critical path is: shared protocol → extension skeleton → element selection → messaging pipeline → WebSocket → source resolution → CLI integration → end-to-end flow.

### Phase 1: Project Foundation & Shared Protocol
**Rationale:** Everything depends on the monorepo structure and shared types. Establishing the message protocol contract first prevents the "message type sprawl" technical debt pattern (PITFALLS.md).
**Delivers:** pnpm monorepo with `packages/extension`, `packages/server`, `packages/shared`; Zod schemas for all WebSocket message types; TypeScript project references; base build configuration.
**Addresses:** Development infrastructure, typed message contracts
**Avoids:** Message type sprawl anti-pattern; protocol inconsistencies between extension and server

### Phase 2: Extension Skeleton & Side Panel Shell
**Rationale:** WXT setup with MV3 manifest, service worker lifecycle, content script injection, and side panel scaffolding must be correct from the start. CP-1 (service worker lifecycle) and CP-6 (side panel gesture) are architectural decisions that cascade through the entire project.
**Delivers:** Working Chrome extension installable from `wxt dev`; service worker with lifecycle management; content script injection; side panel with React + Tailwind rendering; `setPanelBehavior` for reliable opening.
**Addresses:** Table stakes — sidebar panel, keyboard shortcut activation
**Avoids:** CP-1 (service worker termination), CP-6 (side panel gesture failure)

### Phase 3: Element Selection & Highlighting
**Rationale:** Core user interaction — hover-to-highlight, click-to-select. Must work reliably before adding source resolution on top. CP-5 (overlay blocks interaction) is a subtle UX trap that must be solved early with the right DOM approach.
**Delivers:** Hover overlay with box-model visualization; Alt+Click selection; Escape to cancel; Shadow DOM isolation for overlay styling; bounding rect computation.
**Addresses:** Table stakes — element selection with visual highlighting, keyboard shortcut
**Avoids:** CP-5 (overlay blocks interaction), CSS conflict between overlay and page

### Phase 4: Extension Messaging & WebSocket Connection
**Rationale:** The communication backbone must be in place before any data flows between components. Service worker ↔ content script ↔ side panel messaging plus WebSocket to local server forms the pipeline everything else uses. Architect the service worker WebSocket keepalive correctly here (CP-1).
**Delivers:** Content script → service worker → side panel message routing; WebSocket client in service worker with 20s keepalive; `chrome.storage.session` for state persistence across worker restarts; reconnection via `chrome.alarms`.
**Addresses:** Table stakes — WebSocket communication, real-time status
**Avoids:** CP-1 (WebSocket drops during operations), anti-pattern of content script as logic hub

### Phase 5: Local WebSocket Server
**Rationale:** The server is the other end of the WebSocket pipe and must exist before Claude Code integration. Relatively straightforward Node.js development with minimal pitfalls compared to extension work. Can be developed and tested independently with any WebSocket client.
**Delivers:** `ws` WebSocket server on configurable port; Zod-validated request handling; serial request queue; health check endpoint; `npx inspatch-server` or similar launcher.
**Addresses:** Infrastructure for CLI orchestration, request queuing
**Avoids:** Port conflict issues (configurable from start)

### Phase 6: React Fiber Detection & Source Map Resolution
**Rationale:** These are the two highest-risk technical areas (both rated HIGH complexity in FEATURES.md) and are the foundation of Inspatch's value — knowing *which component* and *which source file* the user clicked. Group them because they're interdependent: fiber gives component names, source maps give file locations, and both feed into context assembly. Validate across Vite, Next.js, and CRA early.
**Delivers:** Main-world script injection for `__reactFiber$` traversal; component name + parent chain extraction; source map fetching from content script; `source-map-js` parsing; cross-bundler validation (Vite, Next.js, CRA).
**Addresses:** Table stakes — click-to-source, component name display, React tree awareness; Differentiator — no-plugin source map resolution
**Avoids:** CP-2 (world isolation), CP-3 (source map fetch), CP-4 (VLQ corruption), CP-7 (production name stripping)

### Phase 7: Screenshot Capture & Context Assembly
**Rationale:** With element selection, fiber data, and source location working, assemble the full structured context that makes Claude Code's changes accurate. Screenshot capture via `captureVisibleTab` is low-risk and provides high-value visual context. This phase produces the `ChangeRequest` payload.
**Delivers:** Element screenshot via `captureVisibleTab` + OffscreenCanvas crop; structured `ChangeRequest` JSON assembly (component, file, line, styles, screenshot, description); context display in side panel.
**Addresses:** Differentiators — screenshot capture, structured context assembly
**Avoids:** Performance trap of html2canvas; viewport-only capture limitation (document clearly)

### Phase 8: Claude Code CLI Integration
**Rationale:** The core differentiator — receiving a structured change request and invoking Claude Code to modify source files. Depends on server (Phase 5) and context assembly (Phase 7). Use `--print --output-format stream-json --verbose` for streaming status updates back through the WebSocket pipeline.
**Delivers:** Prompt template construction from `ChangeRequest`; `child_process.spawn` with streaming NDJSON parsing; status events streamed to extension; cancellation via `AbortController`; execution timeout (60-120s).
**Addresses:** Core differentiator — natural language → source code changes; Table stakes — dev server hot-reload feedback
**Avoids:** Anti-pattern of stdin pipe (use CLI argument); unbounded process execution; prompt injection

### Phase 9: End-to-End Integration & Polish
**Rationale:** Wire the full pipeline: click element → see info in sidebar → type description → see streaming status → code changes → HMR reloads page → confirm success. Handle error cases, edge cases from PITFALLS.md "Looks Done But Isn't" checklist, and UX polish.
**Delivers:** Complete click-to-change flow; HMR reload detection; git diff summary display; error recovery UI; change confirmation feedback; edge case handling (dynamic elements, scrolled-off-screen elements, stale source maps).
**Addresses:** All remaining table stakes; Differentiator — undo awareness via git status
**Avoids:** "Looks Done But Isn't" items from PITFALLS.md

### Phase 10: Testing, Documentation & Distribution
**Rationale:** Validate the complete product against MVP requirements, prepare for Chrome Web Store submission, and ensure the local server has a clean install/run experience.
**Delivers:** Cross-bundler testing (Vite, Next.js, CRA); Chrome Web Store listing preparation; privacy policy; `npx` launcher for server; README with setup instructions; minimal `host_permissions` for store approval.
**Addresses:** Distribution, trust building (localhost-only permissions)
**Avoids:** Chrome Web Store rejection (over-broad permissions, missing privacy policy)

### Phase Ordering Rationale

- **Foundation first (Phases 1-2):** Monorepo structure and extension skeleton set architectural patterns that cascade through everything. Service worker lifecycle decisions cannot be retrofitted.
- **Interaction before intelligence (Phases 3-4):** Element selection and messaging work purely in the browser — fast iteration, immediate visual feedback, no server dependency. Proves the UX works.
- **Server before AI (Phase 5):** The server is simple and enables testing the full pipeline with mock responses before Claude Code is integrated.
- **Highest-risk middle (Phase 6):** Source map resolution and fiber detection are the hardest technical challenges. Tackling them in the middle means the infrastructure is proven and there's time to iterate.
- **Context assembly before CLI (Phases 7-8):** Quality of Claude Code output depends entirely on context quality. Get the `ChangeRequest` payload right, then wire it to the CLI.
- **Integration last (Phases 9-10):** End-to-end polish and distribution only after all components work individually.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Extension Skeleton):** MV3 service worker lifecycle edge cases are numerous and poorly documented outside Chrome's official tutorials. Research how React DevTools and similar production extensions handle worker restarts.
- **Phase 6 (Fiber Detection & Source Maps):** Highest technical risk. React 19's `_debugStack` + source map approach (proven by show-component) needs validation. Cross-bundler source map variations (webpack:// URLs in Next.js, cheap-module-source-map in CRA) need concrete testing.
- **Phase 8 (Claude Code CLI):** CLI flags and output format evolve rapidly. Validate `--output-format stream-json` behavior, prompt size limits, and `--allowedTools` restrictions against current CLI version.

Phases with standard patterns (skip deep research):
- **Phase 1 (Foundation):** Standard pnpm monorepo + Zod schemas. Well-documented.
- **Phase 3 (Element Selection):** VisBug's open-source Shadow DOM approach is well-documented and proven at scale (500K users).
- **Phase 5 (WebSocket Server):** Straightforward `ws` server. Battle-tested patterns.
- **Phase 7 (Screenshot):** `captureVisibleTab` + Canvas crop is a documented Chrome API pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against npm registry and official docs (March-April 2026). WXT 0.20.20, React 19.0.4, Tailwind 4.2 all confirmed. |
| Features | HIGH | 12 competitor tools analyzed with verified sources. Feature landscape is mature and well-understood. |
| Architecture | HIGH | MV3 patterns well-documented; 7 architectural patterns backed by official Chrome docs and production extensions. CLI integration patterns verified with known issues documented. |
| Pitfalls | HIGH (extension), MEDIUM (CLI) | Chrome extension pitfalls well-sourced from official docs, React DevTools migration, and VisBug. Claude Code CLI pitfalls based on community reports and docs that evolve rapidly. |

**Overall confidence:** HIGH — the domain is well-explored, the stack is mature, and critical pitfalls have documented mitigations. The main uncertainty is Claude Code CLI behavior, which evolves faster than the Chrome extension ecosystem.

### Gaps to Address

- **Claude Code CLI `stream-json` stability:** Output format may change between CLI versions. Pin a minimum CLI version and validate format on server startup.
- **React 19 Server Components in Next.js App Router:** Server Components produce a different fiber tree structure with partial hydration. Fiber traversal may not work for server-rendered subtrees. Validate during Phase 6 and degrade gracefully to source-map-only resolution.
- **Cross-bundler source map fidelity:** Vite, Next.js (webpack/turbopack), and CRA generate different source map quality levels. `cheap-module-source-map` (CRA default) lacks column accuracy. Test and document limitations per bundler.
- **MV3 service worker WebSocket ownership trade-off:** PITFALLS.md suggests the side panel may be a better WebSocket owner than the service worker (longer lifetime while visible). This architectural decision needs validation in Phase 2 — the trade-off is reliability vs. complexity.
- **Offscreen document for screenshot cropping:** Service workers have no Canvas API. Cropping requires an offscreen document, which has its own lifecycle constraints. Validate the create-crop-destroy pattern doesn't introduce visible latency.

## Sources

### Primary (HIGH confidence)
- WXT Official Docs (https://wxt.dev) — framework features, entrypoints, Vite 8 support
- Chrome Developers MV3 Docs (https://developer.chrome.com/docs/extensions/mv3) — service workers, messaging, side panel, permissions
- Chrome WebSocket in Service Workers Tutorial — keepalive patterns, Chrome 116+ behavior
- React DevTools Source Code (https://github.com/facebook/react) — fiber tree structure, `_debugSource` removal in React 19
- Claude Code CLI Docs (https://code.claude.com/docs/en) — headless mode, stream-json output, allowed tools

### Secondary (MEDIUM confidence)
- LocatorJS / VisBug / Retune / Layrr — competitor analysis, feature landscape, architectural patterns
- show-component v2.3.0 (https://github.com/sidorares/show-component) — Source Map approach for React 19
- StackOverflow — service worker WebSocket issues, side panel gesture timing, fiber access patterns
- npm registry — version verification for all recommended packages

### Tertiary (LOW confidence)
- Claude Code CLI `stream-json` format documentation — based on community gists; needs validation against current CLI version
- React 19 Server Component fiber behavior — inferred from React DevTools migration PRs; needs hands-on testing

---
*Research completed: 2026-04-13*
*Ready for roadmap: yes*
