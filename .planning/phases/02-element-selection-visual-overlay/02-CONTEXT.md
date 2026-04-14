# Phase 2: Element Selection & Visual Overlay - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement element inspection on locally-served pages: hover highlighting with box-model visualization, Alt+Click selection with persistent highlight, Escape to exit, all rendered in Shadow DOM to isolate from page styles. Content script handles all DOM interaction; sidebar receives selection data via chrome.runtime messaging.

</domain>

<decisions>
## Implementation Decisions

### Overlay Rendering
- **D-01:** Use a single Shadow DOM host element (`<inspatch-overlay>`) injected into the page body. All overlay visuals render inside the shadow root — zero CSS leakage in either direction.
- **D-02:** Overlay container uses `pointer-events: none` globally. Selection detection uses `document.elementFromPoint()` from mousemove/click listeners on the document, not on the overlay itself (per CP-5 mitigation).
- **D-03:** Overlay repositions via `requestAnimationFrame` loop while inspect mode is active; stops when exited to avoid idle CPU cost.

### Highlight Visual Style
- **D-04:** DevTools-style box-model visualization: content area (blue tint), padding (green tint), border (yellow/dark tint), margin (orange tint) — matching Chrome DevTools conventions for familiarity.
- **D-05:** Computed styles (`getComputedStyle`) are read on hover to calculate margin/padding/border dimensions for the box-model overlay.
- **D-06:** Element tag name and dimensions shown in a small tooltip label above the highlighted element (e.g., `div · 320×48`).

### Inspect Mode Lifecycle
- **D-07:** Inspect mode is toggled by a command from the sidebar panel (sent via `chrome.runtime.sendMessage`). No always-on inspection — user explicitly enters inspect mode.
- **D-08:** Alt+Click selects the hovered element, persists the highlight, and sends `ElementSelection` data to the sidebar. Normal clicks are suppressed during inspect mode via `preventDefault`.
- **D-09:** Escape key exits inspect mode and removes all overlays. Also exits if sidebar sends a stop command.
- **D-10:** During inspect mode, scroll events pass through normally (overlay is `pointer-events: none`). Only click is intercepted for selection.

### Content Script ↔ Sidebar Communication
- **D-11:** Content script sends `ElementSelection` payloads to sidebar via `chrome.runtime.sendMessage`. Background service worker relays if needed.
- **D-12:** Sidebar sends inspect mode commands (`start-inspect`, `stop-inspect`) to content script via `chrome.tabs.sendMessage`.
- **D-13:** Selected element reference is stored in content script memory for future phases (screenshot capture, source resolution) — not serialized to storage.

### Claude's Discretion
- Exact color values and opacity levels for box-model overlay tints
- Debounce/throttle timing for mousemove handler (recommended 16-50ms)
- Tooltip label positioning logic (above, below, or flip based on viewport)
- CSS transition/animation details for overlay appearance

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Element Selection Architecture
- `.planning/research/PITFALLS.md` §CP-5 — Overlay blocks page interaction; `pointer-events: none` + `elementFromPoint()` approach
- `.planning/research/PITFALLS.md` §UX-Pitfalls — Overlay flicker, selection mode blocking interaction

### Extension Framework
- `.planning/research/ARCHITECTURE.md` — Extension architecture, content script patterns
- `.planning/research/STACK.md` — WXT 0.20.20 configuration, entry point conventions

### Requirements
- `.planning/REQUIREMENTS.md` — ELEM-01 through ELEM-05

### Prior Phase Context
- `.planning/phases/01-project-foundation-extension-shell/01-CONTEXT.md` — D-04 (entry points), D-05 (permissions)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/shared/src/schemas.ts` — `ElementSelectionSchema` already defines the selection payload shape (tagName, className, id, xpath, boundingRect, componentName, sourceFile, sourceLine)
- `packages/extension/entrypoints/content.ts` — Placeholder content script, matches `http://localhost:*/*`
- `packages/extension/entrypoints/background.ts` — Service worker with `openPanelOnActionClick`

### Established Patterns
- WXT `defineContentScript` / `defineBackground` API for entry points
- Zod schemas in shared package for all message types
- React 19 + Tailwind CSS 4 in side panel

### Integration Points
- Content script → extends current `entrypoints/content.ts` with overlay and selection logic
- Sidebar App.tsx → needs "Start Inspect" button and element info display area
- Background service worker → may need message relay between content script and sidebar
- `ElementSelectionSchema` from shared package → used to type-check selection payloads

</code_context>

<specifics>
## Specific Ideas

- Box-model visualization should match Chrome DevTools color conventions (users already know this visual language)
- Shadow DOM isolation is non-negotiable per CP-5 and ELEM-04
- `elementFromPoint()` approach avoids the overlay-intercepts-clicks problem entirely

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-element-selection-visual-overlay*
*Context gathered: 2026-04-14*
