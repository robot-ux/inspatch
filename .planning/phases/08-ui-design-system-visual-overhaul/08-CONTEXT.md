# Phase 8: UI Design System & Visual Overhaul - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish Inspatch's own design system and rebuild the sidebar UI with a dark, techy aesthetic. All functionality is already built (Phases 1-7 complete) — this phase is purely visual/UX. No new features, no behavior changes. The sidebar's 9 states must all be reskinned consistently using design tokens defined in the UI-SPEC.

</domain>

<decisions>
## Implementation Decisions

### D-01: Component Architecture — Full Decomposition
- Extract all visual blocks from App.tsx (currently 400+ lines) into independent components
- New components: `HeaderBar`, `ElementCard`, `EmptyState`, `StatusGuide` (disconnected guidance), `NotLocalhost`
- App.tsx becomes a pure state management + layout container — no inline JSX for visual states
- Existing `ProcessingStatus.tsx` and `ChangeInput.tsx` remain but get dark theme treatment

### D-02: Code/Diff Display — Rich with Manual Parsing
- Git diff display gets syntax highlighting: `+` lines green, `-` lines red, `@@` hunk headers blue
- Add line numbers alongside diff lines
- Add a "Copy" button on diff and streamed text blocks
- Parse diff manually (split by `\n`, check first char) — no external library dependency
- Streamed Claude text stays monospace but with dark-theme-appropriate colors

### D-03: Token Integration — Tailwind @theme
- All 22 CSS custom properties registered via Tailwind CSS v4 `@theme` directive
- Developers use utility classes like `bg-ip-primary`, `text-ip-accent`, `border-ip-subtle`
- Token definitions live in `style.css` (or a dedicated `theme.css` imported from style.css)
- No inline `style={{ }}` for token values — everything goes through Tailwind utilities

### D-04: Theme Support — Dark-First with Future Light Readiness
- Ship dark theme only in this phase
- Token names are semantic (`--ip-bg-primary`, not `--ip-dark-bg`) so a future light theme can override values without renaming
- No theme toggle UI in this phase — the dark theme is always on
- `:root` holds dark values; future light theme would use a `.light` class or `prefers-color-scheme` media query

### D-05: Scrollbar — Custom Thin
- 4px width, dark theme colors (track: `--ip-bg-primary`, thumb: `--ip-bg-tertiary`, hover: `--ip-text-muted`)
- Applied via CSS `::-webkit-scrollbar` pseudo-elements
- Matches the compact sidebar density

### D-06: Text Selection — Brand Color
- Use blue-violet gradient accent as selection background (`::selection` pseudo-element)
- Selection text color: white for contrast

### D-07: Focus Ring — Accent Glow
- Focus-visible rings use `--ip-border-accent` color with a subtle outer glow (box-shadow)
- Applied consistently across all interactive elements (buttons, textarea, links)
- No plain browser default outlines — all custom

### Claude's Discretion
- Exact animation timing adjustments for dark theme (shimmer opacity, etc.)
- Whether to add a dedicated `theme.css` file or keep tokens in `style.css`
- Component file naming conventions (kebab-case vs PascalCase filenames)
- Exact hover/active state intensity values

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### UI Design Contract
- `.planning/phases/08-ui-design-system-visual-overhaul/08-UI-SPEC.md` — Complete visual spec: color tokens, spacing scale, typography, component contracts, animation inventory, copywriting, state transitions

### Current Implementation (to be reskinned)
- `packages/extension/entrypoints/sidepanel/App.tsx` — Main sidebar component with all 9 states (400+ lines, to be decomposed)
- `packages/extension/entrypoints/sidepanel/components/ProcessingStatus.tsx` — Processing status + result display
- `packages/extension/entrypoints/sidepanel/components/ChangeInput.tsx` — Text input + image paste
- `packages/extension/entrypoints/sidepanel/style.css` — Current animations and Tailwind import
- `packages/extension/entrypoints/sidepanel/index.html` — HTML entry point (needs dark background)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `style.css`: 7 keyframe animations already defined (fade-in, fade-in-scale, slide-up, slide-down, glow-pulse, shimmer, status-dot) — adapt for dark theme, don't rewrite
- `useWebSocket` hook: returns `status`, `reconnect` — UI consumes these directly
- `@inspatch/shared` types: `ElementSelection`, `StatusUpdate`, `ChangeResult` — component props derive from these

### Established Patterns
- React functional components with hooks
- Tailwind CSS utility-first styling (v4 with CSS-first config)
- Chrome extension APIs via `chrome.tabs.*`, `chrome.runtime.*`
- WXT framework entrypoint conventions

### Integration Points
- `App.tsx` state (sidebarState, selectedElement, processing, changeResult) must be passed down to new child components as props
- `index.html` needs `<body>` background color set to match dark theme (prevent white flash)
- Content script overlay is separate — not affected by sidebar theme changes

</code_context>

<specifics>
## Specific Ideas

- Reference products for visual direction: DevLens Pro, VisBug, Chrome DevTools dark theme
- The diff display should feel like a mini VS Code diff viewer — colored lines, monospace, compact
- Semi-transparent card backgrounds with subtle border glow on hover (glass-morphism lite)
- The "Start Inspect" button should be the most visually prominent element — gradient CTA

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-ui-design-system-visual-overhaul*
*Context gathered: 2026-04-14*
