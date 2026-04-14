---
phase: 08-ui-design-system-visual-overhaul
plan: 02
title: "Component Extraction & Dark Theme Wiring"
subsystem: extension-sidebar
tags: [ui, components, dark-theme, refactor]
dependency_graph:
  requires: [08-01]
  provides: [HeaderBar, NotLocalhost, EmptyState, StatusGuide, ElementCard]
  affects: [App.tsx]
tech_stack:
  added: []
  patterns: [component-extraction, token-based-theming]
key_files:
  created:
    - packages/extension/entrypoints/sidepanel/components/HeaderBar.tsx
    - packages/extension/entrypoints/sidepanel/components/NotLocalhost.tsx
    - packages/extension/entrypoints/sidepanel/components/EmptyState.tsx
    - packages/extension/entrypoints/sidepanel/components/StatusGuide.tsx
    - packages/extension/entrypoints/sidepanel/components/ElementCard.tsx
  modified:
    - packages/extension/entrypoints/sidepanel/App.tsx
decisions:
  - "statusConfig moved into HeaderBar (co-located with its only consumer)"
  - "Button text 'Clear' changed to 'Clear Selection' per UI-SPEC copywriting contract"
  - "Stop Inspect button no longer uses inline style prop for glow — glow-pulse keyframe has error red baked in from Plan 01"
metrics:
  duration_seconds: 141
  completed: "2026-04-14T12:57:40Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 1
---

# Phase 08 Plan 02: Component Extraction & Dark Theme Wiring Summary

**One-liner:** Decomposed 400-line App.tsx into 5 dark-themed components using --ip-* design tokens, reducing App.tsx to pure state management + layout.

## What Was Built

### 5 Extracted Components

1. **HeaderBar.tsx** — Connection status header bar with gradient "inspatch" wordmark, status dot (connected/reconnecting/disconnected), and reconnect click handler
2. **NotLocalhost.tsx** — Self-contained localhost-only empty state with lock icon, heading, and explanatory text
3. **EmptyState.tsx** — Dual-state component handling connected idle ("Select an element…") and inspecting (spinner + instruction) states
4. **StatusGuide.tsx** — Disconnected guidance with terminal command block, gradient reconnect button, and requirements note
5. **ElementCard.tsx** — Full element info card: tag name, dimensions, ID, classes, XPath, component detection with parent chain, source file path — all with hover glow effect

### Refactored App.tsx

- Removed all inline visual JSX for individual states
- Replaced `statusConfig` (moved to HeaderBar)
- Added imports for all 5 new components
- Replaced all legacy Tailwind classes (`bg-white`, `bg-gray-50`, `border-gray-200`, `bg-blue-600`, `bg-red-600`, `text-gray-*`, etc.) with `--ip-*` token utilities
- Updated "Clear" button text to "Clear Selection" per copywriting contract
- Preserved all state management: 4 useEffect hooks, 8 useCallback handlers, all useState declarations, useRef, useWebSocket

## Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create HeaderBar, NotLocalhost, EmptyState, StatusGuide | 2d4e1ed | HeaderBar.tsx, NotLocalhost.tsx, EmptyState.tsx, StatusGuide.tsx |
| 2 | Create ElementCard + refactor App.tsx | 426446c | ElementCard.tsx, App.tsx |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED
