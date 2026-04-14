# Feature Research

**Domain:** Chrome Extension Visual Code Editing Tool
**Researched:** 2026-04-13
**Confidence:** HIGH (12 competitor tools analyzed, multiple verified sources)

## Feature Landscape

### Table Stakes (Users Expect These)

Features every tool in this space provides. Missing any of these and developers will dismiss Inspatch immediately.

| Feature | Why Expected | Complexity | Notes |
|---------|-------------|------------|-------|
| Element selection with visual highlighting | Every dev tool from Chrome DevTools to LocatorJS highlights on hover. Developers' muscle memory expects this. | Medium | Use overlay with box-model visualization (margin/padding/border). Shadow DOM to avoid CSS conflicts with page. |
| Click-to-source code location | LocatorJS (40K users), click-to-component, React DevTools all resolve elements to source files. This is the baseline interaction. | High | Source Map parsing is the React 19-compatible approach (no `_debugSource`, no Babel plugin). Use `_debugStack` + source maps like show-component. |
| Component name and file path display | React DevTools shows component names in its tree. Users expect to see "which component is this?" instantly. | Medium | React fiber tree traversal for component names. Display file path, line number, and component hierarchy. |
| Keyboard shortcut activation | LocatorJS uses Alt+Click, click-to-component uses Option+Right-Click, VisBug uses toolbar. A modifier key combo to enter selection mode is universal. | Low | Alt/Option+Click to select. Escape to cancel. Follow LocatorJS convention since it has the largest user base (40K). |
| Localhost-only operation | Every tool in this space (LocatorJS, Retune, Layrr) is dev-only. Users expect zero network calls to external servers. | Low | Already a project constraint. Enforce this visibly in permissions to build trust. |
| Dev server hot-reload feedback | Retune, Layrr, and Cursor Visual Editor all rely on Vite/Next.js HMR for instant visual feedback after source changes. | Low | Not Inspatch's responsibility to implement — piggyback on existing HMR. But must detect reload completion to close the feedback loop. |
| Sidebar panel for input and status | Chrome extension sidebar is the standard UX pattern for richer interactions (React DevTools, CSS Pro). Inline popups are too cramped. | Medium | Extension sidebar showing: selected element info, natural language input, processing status, change result. |
| React component tree awareness | React DevTools, Retune, and Layrr all traverse React's fiber tree. Without this, the tool is just a DOM inspector. | High | Walk fiber tree from selected DOM node upward. Extract component name, props, file path. Critical for React/Next.js positioning. |

### Differentiators (Competitive Advantage)

Features that set Inspatch apart. Not every tool has these — or does them well.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Natural language → source code changes via Claude Code CLI | **Core differentiator.** User describes "make this button bigger and blue" and the actual source file is modified. Cursor Visual Editor does this but requires the full Cursor IDE. Layrr and Retune do this but as separate apps. Inspatch does it as a lightweight Chrome extension. | High | Structured prompt: component name + file path + line number + current styles + screenshot + user description → Claude Code CLI. Quality of context determines quality of changes. |
| Screenshot capture for visual context | Captures what the user *sees*, not just DOM structure. Gives Claude Code spatial understanding of the element in context — layout, surrounding elements, visual hierarchy. | Medium | Element-level screenshot via Chrome extension APIs (`chrome.tabs.captureVisibleTab` + crop). Include in prompt alongside structural data. Layrr does this; Retune does not. |
| Source Map resolution (no build plugin required) | Works with any modern dev server out of the box. No `babel-plugin-transform-react-jsx-source`, no Vite plugin config. React 19 compatible via `_debugStack` + source maps. | High | Key technical advantage over LocatorJS and click-to-component which require Babel plugins and broke with React 19. show-component proved this approach works. |
| Real-time processing status via WebSocket | AI changes take seconds. Users need to see "analyzing element... locating source... generating changes... applying..." not a spinner. Cursor Visual Editor shows agent progress; Inspatch should too. | Medium | WebSocket between extension and local server. Stream status updates: element analyzed → file located → Claude Code invoked → changes applied → HMR detected. |
| Structured context assembly | Not just "change this div" — pass component name, file:line, computed styles, parent component chain, Tailwind classes, screenshot. Richer context = better AI output. | Medium | Assemble structured JSON with all available context. This is what makes Claude Code's changes accurate vs. generic AI CSS generators like ClickRemix. |
| Zero-config Chrome extension (no Electron, no IDE lock-in) | Retune requires `npm install retune` + component in layout. Design In The Browser requires Electron app download. Cursor requires the full IDE. Inspatch is just a Chrome extension + lightweight local server. | Low | Lower friction = faster adoption. Extension installs in seconds. Local server via `npx inspatch` or similar one-liner. |
| Multi-select with batch instructions | Select multiple elements, describe one change that applies to all. Layrr supports Shift+click multi-select. Design In The Browser supports multi-edit queuing. | Medium | Queue selections, apply single natural language instruction to all. Useful for "make all these buttons use the primary color" type operations. |
| Undo awareness via git status | Instead of building a fragile undo UI, surface git diff of changes Claude Code made. User can `git checkout -- file` to revert. | Low | After changes applied, show which files were modified and the diff. Leverage git as the undo mechanism (already a project decision). |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem valuable but are traps. Either too complex, orthogonal to Inspatch's purpose, or actively harmful.

| Anti-Feature | Why Avoid | What To Do Instead |
|-------------|-----------|-------------------|
| Visual CSS property sliders/pickers (VisBug-style) | Massive surface area (colors, spacing, typography, shadows, gradients). VisBug has 500K users and years of investment in this. CSS Pro charges $20-30/month. Building a competing visual editor is a different product entirely. Generated CSS often bypasses design tokens — 85% of large React apps already have 400+ hardcoded color values. | Natural language descriptions handle all of this. "Make the padding larger" is faster than dragging a slider and produces design-system-aware code when Claude Code understands the codebase context. |
| Drag-and-drop element reordering | Cursor Visual Editor's drag-and-drop only works reliably with margin-based layouts. CSS Grid/Flexbox gap layouts cause crashes. Mapping DOM reorder back to JSX source order is fragile and framework-dependent. | Natural language: "Move the sidebar above the main content on mobile." Claude Code understands layout intent, not just DOM position. |
| Live props/state editing | React DevTools already does this perfectly with 10+ years of investment. Duplicating this is wasteful and will always be inferior. | Show props as read-only context. If the user wants to change default props, they describe it: "Make this button default to disabled." |
| Inline text editing | Clicking text to edit it inline seems intuitive, but mapping edited text back to the correct JSX expression, i18n key, or variable is extremely fragile. Text might come from props, state, context, or API responses. | Natural language: "Change the heading to say Welcome Back." Claude Code finds the right source location. |
| Multi-framework support in v1 | Vue, Svelte, Angular each have different component models, dev tools APIs, and fiber equivalents. Layrr supports 8 frameworks but with varying quality. React-first with deep quality beats shallow multi-framework. | Ship React/Next.js first. Architecture should be extensible (framework adapters), but v1 is React-only. Matches project constraint. |
| Design token enforcement/linting | Separate concern that adds complexity. Deslint and similar tools already handle this as ESLint plugins. Coupling it into a visual editing tool muddies the purpose. | Claude Code can be prompted to prefer design tokens when the codebase has them. This is a prompt engineering concern, not a feature. |
| Real-time collaborative editing | Google Docs-style collaboration requires CRDT/OT, conflict resolution, and multiplayer state sync. Massive engineering effort for a dev tool typically used solo. | Single developer workflow. Git branches handle collaboration. Already out of scope per PROJECT.md. |
| Direct Anthropic API integration | Bypassing Claude Code CLI means handling authentication, rate limiting, file system access, and tool use orchestration. CLI handles all of this natively. | Use Claude Code CLI. It manages auth, file access, and tool use. Already a key decision per PROJECT.md. |

## Feature Dependencies

```
Element Selection + Highlighting
  └─→ Source Map Resolution (locate source file)
       └─→ React Fiber Tree Traversal (component name, props)
            └─→ Context Assembly (structured data for AI)
                 └─→ Screenshot Capture (visual context)
                      └─→ Sidebar Panel (display info + input)
                           └─→ WebSocket Server (send to local server)
                                └─→ Claude Code CLI Integration (apply changes)
                                     └─→ Hot-Reload Detection (confirm changes applied)

Multi-Select ──→ Context Assembly (extends to handle multiple elements)

Git Diff Display ──→ Claude Code CLI Integration (post-change)
```

Critical path: Element Selection → Source Map Resolution → Context Assembly → Claude Code CLI → Hot-Reload Detection. Every other feature branches off this spine.

## MVP Definition

### Launch With (v1.0)

1. **Element selection with highlighting** — hover overlay, Alt+Click to select
2. **Source Map-based source resolution** — file path + line number, React 19 compatible
3. **React fiber tree traversal** — component name, parent chain
4. **Sidebar panel** — element info display, natural language input field, status display
5. **Screenshot capture** — element-level screenshot for Claude Code context
6. **Context assembly** — structured JSON: component, file, line, styles, screenshot, description
7. **WebSocket local server** — receives structured requests, streams status updates
8. **Claude Code CLI integration** — invoke with assembled context, apply changes to source
9. **Change confirmation** — detect HMR reload, show success/failure + git diff summary

### Add After Launch (v1.x)

10. **Multi-select** — Shift+click to select multiple elements, batch instructions
11. **Change history** — log of recent changes with file paths and descriptions
12. **Component hierarchy browser** — visual tree showing React component structure
13. **Tailwind class detection** — recognize and display Tailwind utilities, pass to Claude Code
14. **Prompt templates** — common operations as quick-select ("change color", "adjust spacing", "make responsive")

### Future (v2+)

15. **Vue/Svelte/Angular adapters** — framework-specific fiber/component tree resolution
16. **Area select** — drag a box around a region instead of clicking single elements
17. **Reference image comparison** — drop a design screenshot, AI matches the implementation
18. **Design token awareness** — detect CSS variables / Tailwind config and prefer them in prompts
19. **Accessibility audit** — select element, get WCAG compliance feedback and fixes

## Feature Prioritization Matrix

| Feature | User Value | Technical Risk | Build Effort | Priority |
|---------|-----------|---------------|-------------|----------|
| Element selection + highlighting | Critical | Low | Medium | P0 |
| Source Map resolution | Critical | High | High | P0 |
| React fiber traversal | Critical | Medium | Medium | P0 |
| Sidebar panel | Critical | Low | Medium | P0 |
| Claude Code CLI integration | Critical | Medium | Medium | P0 |
| WebSocket server | High | Low | Medium | P0 |
| Screenshot capture | High | Low | Low | P0 |
| Context assembly | Critical | Low | Medium | P0 |
| Hot-reload detection | High | Medium | Low | P0 |
| Multi-select | Medium | Low | Low | P1 |
| Change history | Medium | Low | Low | P1 |
| Tailwind detection | Medium | Low | Low | P1 |
| Component hierarchy browser | Medium | Medium | Medium | P1 |
| Prompt templates | Low | Low | Low | P2 |
| Area select | Medium | Medium | Medium | P2 |
| Multi-framework support | High | High | High | P2 |
| Reference image comparison | Medium | Medium | Low | P2 |

## Competitor Feature Analysis

| Feature | LocatorJS | React DevTools | Vite Click-to-Component | VisBug | CSS Pro | Cursor Visual Editor | Retune | Layrr | Design In Browser | **Inspatch** |
|---------|-----------|---------------|------------------------|--------|---------|---------------------|--------|-------|-------------------|-------------|
| Element selection | Alt+Click | Click in tree | Option+Right-Click | Click | Click | Click | Click | Click + Shift multi | Click + area select | Alt+Click + Shift multi |
| Source file resolution | Babel plugin | Fiber tree | Babel plugin | None | None | Bundler integration | CSS selectors + fiber | DOM context + React | Jump to code | Source Maps (no plugin) |
| React 19 support | Broken | Native | Broken | N/A | N/A | Yes | Yes (fiber) | Yes | Unknown | Yes (via _debugStack) |
| Component name display | Yes | Yes | Yes (context menu) | No | No | Yes | Yes | Yes | No | Yes |
| Natural language input | No | No | No | No | AI add-on ($30/mo) | Yes | Via AI agent | Yes | Yes | Yes (core feature) |
| Source code modification | No (opens editor) | No (opens editor) | No (opens editor) | No (CSS only, no source) | No (CSS only) | Yes (via AI agent) | Yes (via AI agent) | Yes (via Claude Code) | Yes (via AI agent) | Yes (via Claude Code) |
| Screenshot context for AI | No | No | No | No | No | Yes (built-in browser) | No | Yes | No (uses annotations) | Yes |
| Real-time status updates | No | No | No | No | No | Yes | Unknown | Unknown | Terminal output | Yes (WebSocket) |
| Framework support | React, Vue, Svelte, Solid, Preact | React only | React only | Any (CSS-level) | Any (CSS-level) | Any | React (Next.js, Vite, Remix) | React, Vue, Svelte + 5 more | Any | React/Next.js (v1) |
| Install friction | Chrome extension | Chrome extension | npm + Vite config | Chrome extension | Chrome extension ($20-30/mo) | Full IDE required | npm install + component in layout | CLI tool or web app | Electron app download | Chrome extension + npx server |
| Open source | Yes (MIT) | Yes (MIT) | Yes (MIT) | Yes (Apache 2.0) | No (commercial) | No (commercial) | No (partial) | Yes (MIT) | Yes (MIT) | Yes (planned) |

### Competitive Positioning

**Closest competitors:** Layrr, Retune, Cursor Visual Editor

- **vs. Layrr:** Both target Claude Code integration. Layrr is a CLI tool / web app; Inspatch is a Chrome extension (lower friction). Layrr supports more frameworks; Inspatch goes deeper on React with Source Map resolution.
- **vs. Retune:** Retune requires adding a component to your layout code. Inspatch requires no code changes — just a Chrome extension. Retune uses CSS selectors for code location; Inspatch uses Source Maps (more precise).
- **vs. Cursor Visual Editor:** Requires buying into the full Cursor IDE. Has drag-and-drop but it's unreliable across layout types. Inspatch is IDE-agnostic — works with any editor + Claude Code CLI.
- **vs. LocatorJS:** LocatorJS only opens the editor at the right file. Inspatch opens the file AND makes the change via AI. LocatorJS is the "click-to-source" layer; Inspatch is "click-to-change."

**Inspatch's unique position:** Lightweight Chrome extension that combines Source Map-based element resolution with Claude Code CLI integration. No IDE lock-in, no layout code changes, no Electron app. Point, describe, done.

## Sources

- LocatorJS: https://www.locatorjs.com/ — Chrome Web Store (40K users, 4.3 rating)
- React DevTools v7.0: https://github.com/facebook/react/blob/main/packages/react-devtools/CHANGELOG.md
- vite-plugin-react-click-to-component v4.2.1: https://github.com/ArnaudBarre/vite-plugin-react-click-to-component
- VisBug v0.4.0: https://github.com/GoogleChromeLabs/ProjectVisBug (500K users)
- CSS Pro: https://csspro.com/ ($20-30/month, AI via Claude Opus 4.5 / ChatGPT 5.2)
- Cursor Visual Editor: https://cursor.com/blog/browser-visual-editor (Dec 2025, Cursor 2.2)
- Retune v0.7.4: https://retune.dev/ (npm, April 2026)
- Layrr: https://github.com/thetronjohnson/layrr (MIT, March 2026)
- Design In The Browser: https://github.com/assentorp/design-in-the-browser (MIT, Jan 2026)
- React 19 _debugSource removal: https://github.com/facebook/react/issues/32574
- show-component (Source Map approach): https://github.com/sidorares/show-component (v2.3.0, Feb 2026)
- click-to-component: https://github.com/ericclemmons/click-to-component
- ClickRemix: https://www.clickremix.com/
- DragCSS: Chrome Web Store
- CSS drift research: https://www.replay.build/blog/your-design-system-is-lying-to-you-solving-css-variable-drift
- Cursor Visual Editor limitations: https://dredyson.com/i-tested-every-visual-editor-feature-in-cursor-browser-2-2-the-complete-step-by-step-guide-to-what-works-and-what-doesnt/
- Chrome DevTools AI: https://developers.chrome.com/docs/devtools/ai-assistance
