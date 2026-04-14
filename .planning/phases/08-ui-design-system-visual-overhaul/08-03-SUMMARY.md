---
phase: 08-ui-design-system-visual-overhaul
plan: 03
subsystem: sidebar-ui
tags: [dark-theme, processing-status, change-input, diff-display, design-tokens]
dependency_graph:
  requires: [08-01]
  provides: [dark-themed-processing-status, dark-themed-change-input, rich-diff-display]
  affects: [App.tsx]
tech_stack:
  added: []
  patterns: [DiffBlock-inline-component, copy-to-clipboard, manual-diff-parsing]
key_files:
  created: []
  modified:
    - packages/extension/entrypoints/sidepanel/components/ProcessingStatus.tsx
    - packages/extension/entrypoints/sidepanel/components/ChangeInput.tsx
decisions:
  - "Split changeResult rendering into explicit success/error branches for cleaner themed styling"
  - "DiffBlock as standalone function component above ProcessingStatus for reusability"
metrics:
  duration: 99s
  completed: "2026-04-14T12:57:04Z"
  tasks: 2
  files_modified: 2
---

# Phase 08 Plan 03: Dark Theme ProcessingStatus & ChangeInput Summary

Dark-themed ProcessingStatus with rich syntax-highlighted diff display (DiffBlock) and ChangeInput with gradient Send Change button, all using ip-* design tokens from plan 08-01.

## Task Outcomes

| Task | Name | Commit | Files Modified |
|------|------|--------|----------------|
| 1 | Dark theme ProcessingStatus with rich diff display | 2711776 | ProcessingStatus.tsx |
| 2 | Dark theme ChangeInput with gradient send button | 367dcb9 | ChangeInput.tsx |

## Key Changes

### ProcessingStatus.tsx
- **Status labels**: Color progression per step — muted (queued) → blue (analyzing/locating) → accent (generating) → violet (applying) → green (complete) → red (error)
- **DiffBlock component**: Inline syntax-highlighted diff renderer with `+` green, `-` red, `@@` blue, context muted; sequential line numbers; copy button on hover
- **Success card**: `bg-ip-success-muted` with green border, "Changes applied" header, file list in code font, DiffBlock for diff
- **Error card**: `bg-ip-error-muted` with red border, "Failed" header, error at 80% opacity, recovery guidance per copywriting contract, "Try Again" button
- **Processing card**: `bg-ip-info-muted` with blue border, shimmer overlay, gradient-colored spinner, copy button on streamed text
- **Copy functionality**: `navigator.clipboard.writeText` with 2-second "Copied" feedback on both diff and stream areas

### ChangeInput.tsx
- **Container**: `bg-ip-bg-secondary` with `border-ip-border-subtle` top border
- **Textarea**: `bg-ip-bg-input`, accent focus ring (`rgba(99,102,241,0.2)`), `focus:border-ip-border-accent`, muted placeholder
- **Send button**: Gradient (`from-ip-gradient-start to-ip-gradient-end`) when enabled, flat `bg-ip-bg-tertiary` at 40% opacity when disabled; text updated from "Send" to "Send Change"
- **Image preview**: Dark border, remove button with `bg-ip-bg-tertiary` and `aria-label="Remove image"`
- **All logic preserved**: `handlePaste`, `handleKeyDown`, `handleSend`, `canSend` — zero behavioral changes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Clarity] Split success/error into separate return branches**
- **Found during:** Task 1
- **Issue:** Original combined success/error in single conditional block with ternary styling made token application messy
- **Fix:** Separated into explicit `if (changeResult.success)` and fallback error branches for cleaner themed styling
- **Files modified:** ProcessingStatus.tsx
- **Commit:** 2711776

## Legacy Color Audit

Both files verified zero legacy Tailwind colors:
- ProcessingStatus.tsx: 0 matches for `text-gray-`, `bg-green-`, `bg-red-`, `bg-blue-`, `bg-white`
- ChangeInput.tsx: 0 matches for `bg-white`, `bg-blue-600`, `border-gray-`, `text-gray-`, `bg-gray-`

## Self-Check: PASSED

- [x] ProcessingStatus.tsx exists
- [x] ChangeInput.tsx exists
- [x] Commit 2711776 exists in history
- [x] Commit 367dcb9 exists in history
