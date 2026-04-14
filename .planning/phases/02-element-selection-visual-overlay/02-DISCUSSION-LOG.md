# Phase 2: Element Selection & Visual Overlay - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-14
**Phase:** 02-element-selection-visual-overlay
**Areas discussed:** Overlay rendering, Highlight visual style, Inspect mode lifecycle, Content script ↔ sidebar communication
**Mode:** Auto (all recommended defaults selected)

---

## Overlay Rendering

| Option | Description | Selected |
|--------|-------------|----------|
| Shadow DOM custom element | Single `<inspatch-overlay>` with shadow root; zero CSS leakage; VisBug-proven approach | ✓ |
| Regular DOM div | Simpler but CSS conflicts with page styles inevitable | |
| iframe overlay | Full isolation but heavy; pointer-event handling complex | |

**User's choice:** [auto] Shadow DOM custom element (recommended default)
**Notes:** CP-5 in PITFALLS.md specifically recommends Shadow DOM for overlay elements. VisBug uses this exact pattern successfully.

---

## Highlight Visual Style

| Option | Description | Selected |
|--------|-------------|----------|
| DevTools-style box-model | Content/padding/border/margin areas with standard colors; familiar to all devs | ✓ |
| Simple border highlight | Just a colored border around the element; minimal but loses box-model info | |
| Background tint only | Semi-transparent background overlay; simple but no dimensional breakdown | |

**User's choice:** [auto] DevTools-style box-model (recommended — required by ELEM-05)
**Notes:** ELEM-05 explicitly requires box-model visualization (margin, padding, border areas). DevTools colors are universally recognized.

---

## Inspect Mode Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar-triggered toggle | User clicks "Inspect" in sidebar to enter mode; Escape or sidebar button to exit | ✓ |
| Always-on passive | Highlights on hover always; Alt+Click selects | |
| Keyboard shortcut toggle | Global hotkey to enter/exit inspect mode | |

**User's choice:** [auto] Sidebar-triggered toggle (recommended default)
**Notes:** Explicit toggle avoids interfering with normal page interaction. ELEM-02 specifies Alt+Click for selection, ELEM-03 specifies Escape to exit.

---

## Content Script ↔ Sidebar Communication

| Option | Description | Selected |
|--------|-------------|----------|
| chrome.runtime.sendMessage | Standard Chrome extension messaging; service worker relays if needed | ✓ |
| chrome.storage.session | Write to storage, listen for changes; survives service worker restart | |
| Port-based long-lived connection | Persistent channel; more complex lifecycle management | |

**User's choice:** [auto] chrome.runtime.sendMessage (recommended — simplest for request/response pattern)
**Notes:** Message passing is the standard pattern for content↔sidebar communication. Port-based connections add complexity without clear benefit for this phase.

---

## Claude's Discretion

- Exact overlay color values and opacity levels
- Mousemove debounce timing
- Tooltip positioning logic
- CSS transitions for overlay

## Deferred Ideas

None
