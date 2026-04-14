# Phase 1: Project Foundation & Extension Shell - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Set up the development infrastructure: Bun workspace monorepo with three packages (extension, server, shared), WXT-based Chrome extension skeleton with React side panel, shared Zod message schemas, and bun:test across all packages. This phase delivers a working build pipeline and installable extension shell — no features yet.

</domain>

<decisions>
## Implementation Decisions

### Monorepo Layout
- **D-01:** Use Bun workspaces with three packages: `packages/extension`, `packages/server`, `packages/shared`
- **D-02:** `packages/shared` exports Zod schemas and TypeScript types consumed by both extension and server
- **D-03:** Root `package.json` has workspace-level scripts: `dev`, `build`, `test`, `lint`

### Extension Entry Points
- **D-04:** WXT entry points: content script (`entrypoints/content.ts`), service worker (`entrypoints/background.ts`), side panel (`entrypoints/sidepanel/`)
- **D-05:** Manifest V3 with minimal permissions: `activeTab`, `sidePanel`, `scripting`; host permissions for `http://localhost:*/*`
- **D-06:** Use `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` for reliable panel opening

### Shared Schema Design
- **D-07:** Initial Zod message types: `ConnectionStatus`, `ElementSelection`, `ChangeRequest`, `StatusUpdate`, `ChangeResult`
- **D-08:** All messages use discriminated unions with a `type` field for type-safe routing
- **D-09:** Schemas exported as both Zod objects and inferred TypeScript types

### Side Panel Shell
- **D-10:** Side panel renders React 19 + Tailwind CSS 4 with a minimal "connected/disconnected" status indicator
- **D-11:** Side panel shows "Select an element to get started" as initial empty state

### Claude's Discretion
- ESLint/Prettier configuration details
- TypeScript `tsconfig.json` project references setup
- Exact Tailwind theme configuration
- Test file organization within each package

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Extension Framework
- `.planning/research/STACK.md` — WXT 0.20.20 recommendation with configuration details
- `.planning/research/ARCHITECTURE.md` — Extension architecture patterns, project structure

### Pitfalls
- `.planning/research/PITFALLS.md` — CP-1 (service worker lifecycle), CP-6 (side panel gesture)

### Requirements
- `.planning/REQUIREMENTS.md` — INFRA-01 through INFRA-04, SIDE-06

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project

### Established Patterns
- None — this phase establishes the patterns

### Integration Points
- Extension entry points will be consumed by Phase 2 (content script) and Phase 3 (service worker WebSocket)
- Shared schemas will be consumed by Phase 3 (messaging) and Phase 6 (CLI integration)

</code_context>

<specifics>
## Specific Ideas

- Package manager is Bun (not pnpm) — user explicitly requested this
- Test runner is bun:test (not Jest/Vitest)
- Bun workspaces for monorepo (user confirmed bun supports monorepo)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-project-foundation-extension-shell*
*Context gathered: 2026-04-13*
