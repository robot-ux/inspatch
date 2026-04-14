# Phase 4: React Fiber Detection & Source Map Resolution - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Trace selected DOM elements back to their React component name (via React Fiber internals) and original source file + line number (via Source Map parsing). Requires main-world script injection to cross Chrome's isolated world boundary for fiber access. Results displayed in the sidebar alongside existing element info.

</domain>

<decisions>
## Implementation Decisions

### React Fiber Access
- **D-01:** Use `__REACT_FIBER_KEY` pattern — iterate DOM element keys to find the one matching `__reactFiber$` or `__reactInternalInstance$` prefix. This is the standard approach used by React DevTools.
- **D-02:** Main-world script injection via `chrome.scripting.executeScript({ world: 'MAIN' })` to access React internals. Content scripts run in isolated world and cannot see page-level JS objects.
- **D-03:** Walk the fiber tree upward to find the nearest function component (fiber.type is a function, not a string). Extract `fiber.type.name` or `fiber.type.displayName` as component name.
- **D-04:** Build parent component chain by continuing to walk up the fiber tree collecting component names until reaching the root.

### Source Map Resolution
- **D-05:** Use `fiber._debugSource` for React dev mode source info (available when using React dev builds with Babel/SWC plugins). Contains `fileName` and `lineNumber` directly.
- **D-06:** Fallback: fetch the bundled JS file URL from `fiber._debugSource` or page scripts, then fetch and parse the inline/external source map to resolve original file paths.
- **D-07:** Use `source-map-js` package (lightweight, browser-compatible fork of `mozilla/source-map`) for source map parsing.
- **D-08:** Resolution should work for Vite (uses `//# sourceMappingURL` inline or `.map` file), Next.js (similar pattern), and CRA (similar pattern). All expose source maps in dev mode.

### Cross-World Communication
- **D-09:** Main-world script sends fiber data back to content script via `window.postMessage`. Content script listens on `window.addEventListener('message')` and filters by a unique `__inspatch` source identifier.
- **D-10:** Data passed between worlds must be JSON-serializable (no DOM refs, no function refs). Extract only: componentName, parentChain (string[]), sourceFile, sourceLine.

### Sidebar Integration
- **D-11:** Sidebar element info card expands to show: component name, parent chain breadcrumb, source file path, source line number.
- **D-12:** If fiber detection fails (non-React page or production build), gracefully degrade — show "No React component detected" and still show DOM-level info.

### Claude's Discretion
- Exact fiber key detection logic and edge case handling
- Source map fetch caching strategy
- UI layout for component chain display
- Error message wording for degraded mode

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source Resolution Requirements
- `.planning/REQUIREMENTS.md` — SRC-01 through SRC-04, SIDE-01

### Architecture & Research
- `.planning/research/ARCHITECTURE.md` — Extension architecture patterns
- `.planning/research/PITFALLS.md` — CP-3 (source map edge cases), CP-4 (main world injection)

### Prior Phase Context
- `.planning/phases/02-element-selection-visual-overlay/02-CONTEXT.md` — Element selection flow, XPath, content script messaging
- `.planning/phases/01-project-foundation-extension-shell/01-CONTEXT.md` — Extension structure

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/extension/entrypoints/content/element-detector.ts` — `getElementAtPoint()`, `getXPath()` for selected element
- `packages/extension/entrypoints/content/messaging.ts` — sends `element_selection` payload to sidebar
- `packages/extension/entrypoints/content/inspect-mode.ts` — `onSelect` callback with selected DOM Element
- `packages/extension/entrypoints/sidepanel/App.tsx` — Element info card, already shows tagName/className/id/xpath/dimensions
- `packages/shared/src/schemas.ts` — `ElementSelectionSchema` already has optional `componentName`, `sourceFile`, `sourceLine` fields

### Key Integration Points
- `content.ts` `onSelect` callback → needs to trigger fiber detection + source resolution before sending to sidebar
- `ElementSelectionSchema` already supports the fields we need — no schema changes required
- `messaging.ts` `sendElementSelection()` → already sends the payload, just needs enriched data

</code_context>

<specifics>
## Specific Ideas

- Schema already has `componentName`, `sourceFile`, `sourceLine` as optional fields — we just need to populate them
- Main-world script should be a separate file injected on demand, not bundled into content script
- Consider caching fiber lookups for hover performance (optional optimization)

</specifics>

<deferred>
## Deferred Ideas

- Full React component tree visualization (v2 EDET-02)
- Vue/Svelte/Angular support (v2 MFRM-*)
- Tailwind class extraction (v2 EDET-01)

</deferred>

---

*Phase: 04-react-fiber-detection-source-map-resolution*
*Context gathered: 2026-04-14*
