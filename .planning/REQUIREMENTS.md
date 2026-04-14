# Requirements: Inspatch

**Defined:** 2026-04-13
**Core Value:** Developers can click any element on their local dev server page, describe what they want changed in plain language, and see the source code updated automatically.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Element Selection

- [ ] **ELEM-01**: User can hover over any element to see it highlighted with a visual overlay (border, dimensions)
- [ ] **ELEM-02**: User can Alt+Click an element to select it as the target for changes
- [ ] **ELEM-03**: User can press Escape to exit inspect/selection mode
- [ ] **ELEM-04**: Overlay is rendered in Shadow DOM to prevent CSS conflicts with the page
- [ ] **ELEM-05**: User can see box-model visualization (margin, padding, border) on hover

### Source Resolution

- [ ] **SRC-01**: Extension resolves selected element's position to source file path and line number via Source Map parsing
- [ ] **SRC-02**: Extension traverses React fiber tree to extract component name and parent component chain
- [ ] **SRC-03**: Source Map resolution works across Vite, Next.js, and Create React App dev servers
- [ ] **SRC-04**: Main-world script injection handles React fiber access across Chrome's isolated world boundary

### Sidebar Panel

- [ ] **SIDE-01**: Extension sidebar displays selected element info (component name, file path, line number, computed styles)
- [ ] **SIDE-02**: User can type a natural language description of desired changes in the sidebar input
- [ ] **SIDE-03**: Sidebar displays a screenshot of the selected element for visual context
- [ ] **SIDE-04**: Sidebar shows real-time streaming status during Claude Code processing (analyzing → locating → generating → applying)
- [ ] **SIDE-05**: Sidebar shows change result with git diff summary after successful modification
- [ ] **SIDE-06**: Side panel opens reliably via extension icon click (using openPanelOnActionClick behavior)

### Communication

- [ ] **COMM-01**: Extension communicates with local server via WebSocket with automatic reconnection
- [ ] **COMM-02**: Service worker maintains WebSocket connection with keepalive heartbeat (20s ping)
- [ ] **COMM-03**: All messages between extension and server are validated with shared Zod schemas
- [ ] **COMM-04**: Connection state persists across service worker restarts via chrome.storage.session

### Local Server

- [ ] **SERV-01**: Local Node.js WebSocket server can be started with a single command (e.g., `bunx inspatch-server`)
- [ ] **SERV-02**: Server validates incoming requests using shared Zod schemas
- [ ] **SERV-03**: Server queues requests serially to prevent concurrent file modifications
- [ ] **SERV-04**: Server streams status updates back to extension during Claude Code processing

### Claude Code Integration

- [ ] **CLI-01**: Server invokes Claude Code CLI with structured prompt containing element context (component, file, line, styles, screenshot, description)
- [ ] **CLI-02**: Server streams Claude Code output in real-time via WebSocket to extension
- [ ] **CLI-03**: Server handles CLI timeout (60-120s) and error cases gracefully
- [ ] **CLI-04**: After successful change, dev server hot-reload is detected and user sees updated page

### Screenshot

- [ ] **SHOT-01**: Extension captures element-level screenshot via captureVisibleTab + canvas cropping
- [ ] **SHOT-02**: Screenshot is included in the structured context sent to Claude Code for visual understanding

### Project Infrastructure

- [ ] **INFRA-01**: Project is structured as a Bun workspace monorepo (packages/extension, packages/server, packages/shared)
- [ ] **INFRA-02**: Shared package contains Zod schemas and TypeScript types for all message protocols
- [ ] **INFRA-03**: Extension is built with WXT framework (Manifest V3, Vite-based)
- [ ] **INFRA-04**: Tests use bun:test across all packages

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Selection

- **ESEL-01**: User can Shift+Click to multi-select elements and apply batch instructions
- **ESEL-02**: User can drag-select a region to capture multiple elements

### History & Templates

- **HIST-01**: Sidebar displays history of recent changes with file paths and descriptions
- **HIST-02**: User can select from prompt templates for common operations (change color, adjust spacing, make responsive)

### Extended Detection

- **EDET-01**: Extension detects and displays Tailwind CSS utility classes separately
- **EDET-02**: Sidebar shows React component hierarchy tree for browsing

### Multi-Framework

- **MFRM-01**: Extension supports Vue/Nuxt component detection
- **MFRM-02**: Extension supports Svelte/SvelteKit component detection
- **MFRM-03**: Extension supports Angular component detection

## Out of Scope

| Feature | Reason |
|---------|--------|
| Visual CSS sliders/pickers (VisBug-style) | Different product category; natural language handles all use cases better and respects design tokens |
| Drag-and-drop element reordering | Fragile across layout types (Grid/Flexbox); natural language describes intent better |
| Live props/state editing | React DevTools already does this with 10+ years of investment |
| Inline text editing | Mapping text back to JSX expressions/i18n keys is extremely fragile |
| Real-time collaborative editing | Requires CRDT/OT; dev tools are typically solo; git handles collaboration |
| Direct Anthropic API integration | Claude Code CLI handles auth, file access, tool use natively |
| Design token enforcement | Separate concern; ESLint plugins handle this; prompt engineering can prefer tokens |
| Mobile browser support | Desktop Chrome only for v1 |
| Cloud deployment | Local-only tool for development environments |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| SIDE-06 | Phase 1 | Pending |
| ELEM-01 | Phase 2 | Pending |
| ELEM-02 | Phase 2 | Pending |
| ELEM-03 | Phase 2 | Pending |
| ELEM-04 | Phase 2 | Pending |
| ELEM-05 | Phase 2 | Pending |
| COMM-01 | Phase 3 | Pending |
| COMM-02 | Phase 3 | Pending |
| COMM-03 | Phase 3 | Pending |
| COMM-04 | Phase 3 | Pending |
| SERV-01 | Phase 3 | Pending |
| SERV-02 | Phase 3 | Pending |
| SERV-03 | Phase 3 | Pending |
| SRC-01 | Phase 4 | Pending |
| SRC-02 | Phase 4 | Pending |
| SRC-03 | Phase 4 | Pending |
| SRC-04 | Phase 4 | Pending |
| SIDE-01 | Phase 4 | Pending |
| SHOT-01 | Phase 5 | Pending |
| SHOT-02 | Phase 5 | Pending |
| SIDE-02 | Phase 5 | Pending |
| SIDE-03 | Phase 5 | Pending |
| CLI-01 | Phase 6 | Pending |
| CLI-02 | Phase 6 | Pending |
| CLI-03 | Phase 6 | Pending |
| CLI-04 | Phase 6 | Pending |
| SERV-04 | Phase 6 | Pending |
| SIDE-04 | Phase 7 | Pending |
| SIDE-05 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-13*
*Last updated: 2026-04-13 after initial definition*
