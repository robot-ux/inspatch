# Roadmap: Inspatch

## Overview

Inspatch delivers a Chrome extension that lets developers click any element on their local dev server, describe a change in natural language, and have Claude Code CLI modify the source files automatically. The roadmap follows the dependency chain: shared protocol → extension shell → element selection → messaging backbone → source resolution → context assembly → CLI integration → end-to-end polish. Each phase delivers a verifiable capability that the next phase builds on.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Project Foundation & Extension Shell** - Bun monorepo, shared Zod schemas, WXT extension with React side panel
- [ ] **Phase 2: Element Selection & Visual Overlay** - Hover highlighting, Alt+Click selection, Shadow DOM overlay with box-model visualization
- [ ] **Phase 3: Messaging Pipeline & Local Server** - WebSocket communication backbone, service worker lifecycle, local Node.js server
- [ ] **Phase 4: React Fiber Detection & Source Map Resolution** - Component name extraction via fiber tree, source file resolution via Source Maps
- [ ] **Phase 5: Screenshot Capture & Context Assembly** - Element screenshot, natural language input, structured ChangeRequest payload
- [ ] **Phase 6: Claude Code CLI Integration** - CLI invocation with structured prompts, streaming output, hot-reload confirmation
- [ ] **Phase 7: End-to-End Integration & Polish** - Full click-to-change pipeline, streaming status UI, error recovery
- [ ] **Phase 8: UI Design System & Visual Overhaul** - Dark theme, design tokens, component library, cohesive visual identity

## Phase Details

### Phase 1: Project Foundation & Extension Shell
**Goal**: Development infrastructure and a working extension shell are in place for rapid iteration
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, SIDE-06
**Success Criteria** (what must be TRUE):
  1. Developer can clone the repo, run `bun install`, and build all packages without errors
  2. Extension loads in Chrome via `wxt dev` with hot-reload working
  3. Clicking the extension icon opens a side panel with a React-rendered UI
  4. Shared Zod schemas are importable from both extension and server packages
  5. `bun test` runs across all packages with at least one passing test
**Plans:** 2 plans

Plans:
- [ ] 01-01-PLAN.md — Bun monorepo scaffold + shared Zod protocol schemas
- [ ] 01-02-PLAN.md — WXT extension shell + React side panel with Tailwind

**UI hint**: yes

### Phase 2: Element Selection & Visual Overlay
**Goal**: Users can visually inspect and select any element on a locally-served page
**Depends on**: Phase 1
**Requirements**: ELEM-01, ELEM-02, ELEM-03, ELEM-04, ELEM-05
**Success Criteria** (what must be TRUE):
  1. Hovering over any element shows a highlight overlay with element dimensions
  2. Overlay displays box-model visualization (margin, padding, border areas) on hover
  3. Alt+Click selects an element and the highlight persists on the selected element
  4. Pressing Escape exits inspect mode and removes all overlays
  5. Overlay never interferes with normal page interactions (Shadow DOM isolated, pointer-events: none)
**Plans:** 2 plans

Plans:
- [ ] 02-01-PLAN.md — Content script overlay engine (Shadow DOM, box-model visualization, inspect mode state machine, messaging)
- [ ] 02-02-PLAN.md — Sidebar inspect UI and message integration (Start/Stop Inspect button, element info display)

**UI hint**: yes

### Phase 3: Messaging Pipeline & Local Server
**Goal**: Extension and local server can exchange validated messages in real time with resilient connectivity
**Depends on**: Phase 1
**Requirements**: COMM-01, COMM-02, COMM-03, COMM-04, SERV-01, SERV-02, SERV-03
**Success Criteria** (what must be TRUE):
  1. Service worker maintains a WebSocket connection that automatically reconnects after disconnects
  2. Starting the local server is a single command (`bunx inspatch-server`)
  3. Messages between extension and server are validated against shared Zod schemas on both ends
  4. Server correctly queues multiple requests and processes them serially (no concurrent file modifications)
  5. WebSocket connection survives service worker restarts via chrome.storage.session persistence
**Plans:** 2 plans

Plans:
- [ ] 03-01-PLAN.md — Shared schema extensions + Bun WebSocket server with serial queue
- [ ] 03-02-PLAN.md — Extension WebSocket client hook + sidebar connection status wiring

### Phase 4: React Fiber Detection & Source Map Resolution
**Goal**: Selected elements are traced back to their React component name and original source file location
**Depends on**: Phase 1, Phase 2
**Requirements**: SRC-01, SRC-02, SRC-03, SRC-04, SIDE-01
**Success Criteria** (what must be TRUE):
  1. Selecting a React component shows its component name and parent chain in the sidebar
  2. Source file path and line number are resolved via Source Maps and displayed in the sidebar
  3. Source resolution works correctly across Vite, Next.js, and Create React App dev servers
  4. Main-world script injection successfully accesses React fiber data across Chrome's isolated world boundary
**Plans:** 2 plans

Plans:
- [ ] 04-01-PLAN.md — Fiber detection engine + source map resolution modules
- [ ] 04-02-PLAN.md — Integration pipeline wiring + sidebar component info display

**UI hint**: yes

### Phase 5: Screenshot Capture & Context Assembly
**Goal**: Full structured context is assembled for any selected element, ready for AI processing
**Depends on**: Phase 2, Phase 4
**Requirements**: SHOT-01, SHOT-02, SIDE-02, SIDE-03
**Success Criteria** (what must be TRUE):
  1. Selecting an element captures a cropped screenshot of just that element
  2. Screenshot of the selected element appears in the sidebar alongside element info
  3. User can type a natural language change description in the sidebar input
  4. A complete ChangeRequest payload (component, file, line, styles, screenshot, description) is assembled
**Plans:** 2 plans

Plans:
- [ ] 05-01-PLAN.md — Schema extensions + content script DPR/computed styles enrichment
- [ ] 05-02-PLAN.md — Screenshot capture hook, sidebar UI components, ChangeRequest assembly

**UI hint**: yes

### Phase 6: Claude Code CLI Integration
**Goal**: Natural language change descriptions are executed against source code via Claude Code CLI
**Depends on**: Phase 3, Phase 5
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, SERV-04
**Success Criteria** (what must be TRUE):
  1. Server invokes Claude Code CLI with structured prompt containing full element context
  2. Claude Code output streams in real-time through WebSocket back to the extension
  3. Server handles CLI timeouts (60-120s) and errors gracefully with meaningful status messages
  4. After successful source change, dev server hot-reload fires and user sees the updated page
**Plans**: TBD

### Phase 7: End-to-End Integration & Polish
**Goal**: The complete click-to-change pipeline works reliably as a seamless user experience
**Depends on**: Phase 6
**Requirements**: SIDE-04, SIDE-05
**Success Criteria** (what must be TRUE):
  1. User can click an element, type a change, and see the page update — full loop works end-to-end
  2. Sidebar shows real-time streaming status during Claude Code processing (analyzing → locating → applying)
  3. After successful change, sidebar displays a git diff summary of what was modified
  4. Error states (disconnected server, CLI failure, invalid element) show clear recovery guidance
  5. Edge cases are handled: dynamically rendered elements, scrolled-off-screen elements, stale source maps
**Plans**: TBD
**UI hint**: yes

### Phase 8: UI Design System & Visual Overhaul
**Goal**: Establish Inspatch's own design system and rebuild the sidebar UI with a dark, techy aesthetic — consistent tokens, polished components, smooth interactions
**Depends on**: Phase 7
**Requirements**: SIDE-04, SIDE-05
**Success Criteria** (what must be TRUE):
  1. Design tokens (colors, spacing, typography, radii, shadows) defined as CSS custom properties
  2. All sidebar states (disconnected, idle, inspecting, selected, processing, result, error) use the dark theme consistently
  3. Element info card, processing status, change input, and error states feel cohesive and "tool-grade"
  4. Animations are smooth and purposeful — no jarring transitions
  5. The extension looks distinctly "Inspatch" — not generic Tailwind defaults
**Plans**: TBD
**UI hint**: yes

## Requirement Coverage

| Requirement | Phase |
|-------------|-------|
| INFRA-01 | Phase 1 |
| INFRA-02 | Phase 1 |
| INFRA-03 | Phase 1 |
| INFRA-04 | Phase 1 |
| SIDE-06 | Phase 1 |
| ELEM-01 | Phase 2 |
| ELEM-02 | Phase 2 |
| ELEM-03 | Phase 2 |
| ELEM-04 | Phase 2 |
| ELEM-05 | Phase 2 |
| COMM-01 | Phase 3 |
| COMM-02 | Phase 3 |
| COMM-03 | Phase 3 |
| COMM-04 | Phase 3 |
| SERV-01 | Phase 3 |
| SERV-02 | Phase 3 |
| SERV-03 | Phase 3 |
| SRC-01 | Phase 4 |
| SRC-02 | Phase 4 |
| SRC-03 | Phase 4 |
| SRC-04 | Phase 4 |
| SIDE-01 | Phase 4 |
| SHOT-01 | Phase 5 |
| SHOT-02 | Phase 5 |
| SIDE-02 | Phase 5 |
| SIDE-03 | Phase 5 |
| CLI-01 | Phase 6 |
| CLI-02 | Phase 6 |
| CLI-03 | Phase 6 |
| CLI-04 | Phase 6 |
| SERV-04 | Phase 6 |
| SIDE-04 | Phase 7 |
| SIDE-05 | Phase 7 |

**Coverage:** 33/33 ✓

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7
Note: Phases 2 and 3 can execute in parallel (independent dependencies).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Foundation & Extension Shell | 0/0 | Not started | - |
| 2. Element Selection & Visual Overlay | 0/2 | Not started | - |
| 3. Messaging Pipeline & Local Server | 0/0 | Not started | - |
| 4. React Fiber Detection & Source Map Resolution | 0/0 | Not started | - |
| 5. Screenshot Capture & Context Assembly | 0/0 | Not started | - |
| 6. Claude Code CLI Integration | 0/0 | Not started | - |
| 7. End-to-End Integration & Polish | 0/0 | Not started | - |
