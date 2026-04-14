# Phase 8: UI Design System & Visual Overhaul - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-14
**Phase:** 08-ui-design-system-visual-overhaul
**Areas discussed:** Component Architecture, Code/Diff Display, Token Integration, Dark Theme Details

---

## Component Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Full split | HeaderBar, ElementCard, EmptyState, StatusGuide, NotLocalhost all independent components, App.tsx only does state management and layout | ✓ |
| Partial split | Only extract reusable large blocks (ElementCard, HeaderBar), keep small states in App.tsx | |
| Style only | Don't split — only change styles, keep current component structure | |

**User's choice:** Full split
**Notes:** User wants App.tsx to be a pure state + layout container

---

## Code/Diff Display

| Option | Description | Selected |
|--------|-------------|----------|
| Rich display | Diff syntax highlighting (green+/red-), line numbers, copy button | ✓ |
| Basic coloring | Diff add/remove lines use green/red, no line numbers or copy button | |
| Plain dark | Keep plain text, just apply dark theme monospace block | |

**User's choice:** Rich display

| Option | Description | Selected |
|--------|-------------|----------|
| Manual parsing | Parse diff lines by +/- prefix for coloring, lightweight no dependency | ✓ |
| Use library | Import lightweight diff highlight library (e.g., diff2html) | |

**User's choice:** Manual parsing
**Notes:** No external dependency — parse diff lines manually

---

## Token Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Tailwind extend | Register CSS custom properties via @theme, use utility classes like bg-ip-primary in JSX | ✓ |
| Pure CSS | Define :root variables in style.css, use style={{ }} in JSX | |
| Hybrid | High-frequency tokens in Tailwind, low-frequency via CSS var() | |

**User's choice:** Tailwind extend

| Option | Description | Selected |
|--------|-------------|----------|
| Dark only | Inspatch is dark theme, no toggle | |
| Dark-first | Default dark, but token structure supports adding light theme later | ✓ |

**User's choice:** Dark-first with future light readiness
**Notes:** Semantic variable names (--ip-bg-primary not --ip-dark-bg) so future light theme can override values

---

## Dark Theme Details

| Option | Description | Selected |
|--------|-------------|----------|
| Custom thin scrollbar | 4px width, dark theme colors, blends with background | ✓ |
| Hidden scrollbar | Only show on scroll (macOS style) | |
| Default | Don't customize scrollbar | |

**User's choice:** Custom thin scrollbar

| Option | Description | Selected |
|--------|-------------|----------|
| Brand color selection | Blue-violet gradient as selection background | ✓ |
| Default dark | Let browser handle selection | |

**User's choice:** Brand color selection

| Option | Description | Selected |
|--------|-------------|----------|
| Accent glow focus ring | Blue-violet ring + subtle glow box-shadow | ✓ |
| Subtle | Only thin border color change, no ring | |

**User's choice:** Accent glow focus ring

---

## Claude's Discretion

- Exact animation timing adjustments for dark theme
- Whether to use separate theme.css or keep tokens in style.css
- Component file naming conventions
- Exact hover/active state intensity values

## Deferred Ideas

None — discussion stayed within phase scope
