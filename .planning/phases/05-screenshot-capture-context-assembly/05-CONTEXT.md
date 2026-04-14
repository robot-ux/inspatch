# Phase 5: Screenshot Capture & Context Assembly - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Assemble full structured context for any selected element — screenshot, natural language description, component/file/style info — ready for Phase 6's Claude Code invocation. This phase adds screenshot capture, a change description input, and the ChangeRequest payload assembly to the existing sidebar UI.

</domain>

<decisions>
## Implementation Decisions

### Screenshot Capture
- **D-01:** Use `captureVisibleTab` + canvas crop to element's bounding rect. No auto-scroll needed — the user has already scrolled to the element before selecting it.
- **D-02:** Smart format selection — small elements use PNG (lossless), large elements use JPEG (quality threshold TBD, e.g., 80%). Balance between clarity and payload size.
- **D-03:** Include bounding rect position info alongside the screenshot in the ChangeRequest payload — gives Claude spatial context about where the element sits on the page.

### Change Description Input
- **D-04:** Simple textarea with placeholder examples showing what users can describe (e.g., "Make this button larger", "Change the text color to purple").
- **D-05:** Enter to send, Shift+Enter for newline. Also provide a send button for mouse users.

### Sidebar Layout
- **D-06:** Layout order: element info + screenshot (scrollable area) → input fixed at bottom. Chat-like UI pattern — input always accessible.
- **D-07:** Screenshot displays as thumbnail by default (compact), click to expand to full size. Two states: collapsed and expanded.

### Claude's Discretion
- Screenshot size threshold for PNG vs JPEG switch (e.g., 200x200 px)
- Placeholder example text content
- Exact ChangeRequest payload field names and structure (must include: component name, source file, source line, bounding rect, screenshot base64, computed styles subset, description)
- How computed styles are selected (relevant subset vs full dump)

</decisions>

<canonical_refs>
## Canonical References

No external specs — requirements fully captured in decisions above.

### Phase Requirements
- SHOT-01: Element-level screenshot via captureVisibleTab + canvas cropping
- SHOT-02: Screenshot included in structured context for Claude Code
- SIDE-02: Natural language change description input
- SIDE-03: Screenshot displayed in sidebar

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/extension/entrypoints/sidepanel/App.tsx` — Current sidebar with element info display, status bar, inspect buttons
- `packages/extension/entrypoints/sidepanel/hooks/useWebSocket.ts` — WebSocket hook for sending messages to server
- `packages/shared/src/schemas.ts` — Zod schemas including existing `ChangeRequestSchema` and `ElementSelectionSchema`
- `packages/extension/entrypoints/content/element-detector.ts` — `getUniqueSelector()` and `getXPath()` for element identification
- `packages/shared/src/logger.ts` — `createLogger()` for consistent logging

### Established Patterns
- React hooks pattern for state management (useState, useCallback, useRef)
- Tailwind CSS for all styling
- Chrome extension APIs: `chrome.tabs.captureVisibleTab()` available via `activeTab` permission (already declared)
- `chrome.runtime.sendMessage` / `onMessage` for content script ↔ sidebar communication

### Integration Points
- Sidebar `App.tsx` needs screenshot display + textarea input added to the existing element info card
- `ChangeRequestSchema` in shared schemas needs fields for screenshot, description, and bounding rect
- Content script sends element selection → sidebar displays info → user types description → sidebar assembles full ChangeRequest → sends via WebSocket to server

</code_context>

<specifics>
## Specific Ideas

- User mentioned wanting a region selection tool for future (v2) — for now, element bounding rect + screenshot is the selection mechanism
- Position info (bounding rect coordinates) should be included alongside screenshot so Claude knows where the element sits on the page

</specifics>

<deferred>
## Deferred Ideas

- Region/area selection tool (drag to select) — belongs in v2 (ESEL-02)
- Rich text editor for change description — overkill for v1, simple textarea sufficient

</deferred>

---

*Phase: 05-screenshot-capture-context-assembly*
*Context gathered: 2026-04-14*
