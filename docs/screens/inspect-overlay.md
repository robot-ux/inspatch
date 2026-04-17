# Screen: inspect-overlay

<!--
Single-screen spec. Inherits Design System, tokens, principles, and shared
patterns from docs/ui.md. Every token/value below is a reference to ui.md.
-->

## References

- **Base UI doc:** [../ui.md](../ui.md) — design system, tokens, shared patterns
- **PRD:** [../prd.md](../prd.md) — upstream requirements and user stories
- **Related FR(s):** FR-01, FR-02, FR-03
- **User story(ies):** Story 1, Story 2

## Purpose

Inside the localhost tab, give the user a visual target so they can pick exactly the DOM node they want Claude to change.

## Entry & Exit

- **Entry points:** user clicks Start Inspect (or the compact Inspect button) in the side panel; content script injects a Shadow DOM overlay host into the inspected page.
- **Exit points:** user clicks a node (selection sent, overlay clears); user presses ESC (selection cancelled); user clicks Stop in the side panel; tab reloads or navigates.
- **Primary user:** same engineer as `side-panel-main`, now targeting in-page.

## Layout

The overlay is not a traditional screen — it is five absolutely-positioned layers inside a Shadow DOM root on top of the inspected page. No page archetype from `ui-standards.md §3.5` applies; this is a transient visual overlay.

| Region | Content / Components | Notes |
| ------ | -------------------- | ----- |
| Margin layer  | Orange rectangle sized to the element's margin box  | `background: rgba(255, 155, 0, 0.3)` |
| Border layer  | Yellow rectangle sized to the element's border box  | `background: rgba(255, 200, 50, 0.3)` |
| Padding layer | Green rectangle sized to the padding box            | `background: rgba(120, 200, 80, 0.3)` |
| Content layer | Blue rectangle sized to the content box             | `background: rgba(100, 150, 255, 0.3)` |
| Tooltip       | Small monospaced info pill near the target          | `background: #232327`, `border-radius: 3px`, shows tag · size · component name |

Source: `packages/extension/entrypoints/content/overlay-manager.ts`.

## Data Shown

| Field | Source | Format | Notes |
| ----- | ------ | ------ | ----- |
| `boundingRect` | `Element.getBoundingClientRect()` | `{ top, left, width, height }` | Drives all four layers |
| `boxModel`     | `getComputedStyle(el)`            | margin / border / padding widths | Splits the rect into four layers |
| `tagName`      | DOM                                | e.g. `DIV.card` | Left part of tooltip |
| `size`         | rect width × height               | `{w}×{h}px` | Middle of tooltip |
| `componentName`| React Fiber walk (`fiber-main-world.ts`) | e.g. `Button` | Right of tooltip; omitted when unknown |

## Actions

| Trigger | Action | Result | Keyboard shortcut |
| ------- | ------ | ------ | ----------------- |
| Hover any DOM node | Overlay repaints layers + tooltip to that node | Visual-only; no selection | — |
| Click a DOM node   | Selection committed: element captured → `element_selection` message → side panel | Overlay clears | — |
| `Escape` key       | Selection cancelled                                                               | Overlay clears; side panel returns to idle | `Esc` |
| Stop (from panel)  | Content script receives `stop-inspect` → inspect mode stops                       | Overlay clears | — |

## States

> All 8 canonical states from `references/ui-standards.md §7` are filled. Because the overlay is a pointer-only visual surface (no buttons, no focusable elements), **Active / Focus / Disabled / Empty** are genuinely n/a — each row carries a one-line rationale so reviewers can confirm nothing is missing.

| State     | When it shows | What the user sees | Exit condition |
| --------- | ------------- | ------------------ | -------------- |
| **Default**   | Inspect mode just enabled, pointer not yet over any DOM node | Overlay host mounted, layers invisible (zero-sized), tooltip hidden | Pointer enters page content → Hover |
| **Hover**     | Inspect mode on, pointer moves over a DOM node | Four-layer box model painted on the hovered node; tooltip follows the cursor showing `{tag}{#id}{.class} · {w}×{h} · {componentName}` | Pointer leaves element / clicks / presses Esc |
| **Active**    | n/a — no click-and-hold interaction. A click commits selection instantly; there is no "pressed" visual | — | — |
| **Focus**     | n/a — the overlay is not part of the page's tab order. It receives no keyboard focus (only the document-level ESC listener is active) | — | — |
| **Disabled**  | n/a — inspect mode is either fully on or fully off. When off, the overlay host is detached (see Loading below); when on, every hoverable node is eligible | — | — |
| **Loading**   | **Overlay host not yet injected** — between the side panel sending `start-inspect` and the content script mounting the Shadow DOM host (typically < 50ms) | Nothing visible on the page; side panel shows `EmptyState: inspecting` copy instead | Host mounts → Default |
| **Empty**     | n/a — there is no "no data" concept. If inspect mode is active the user always has a page to hover; if inactive the overlay doesn't exist | — | — |
| **Error**     | Two failure modes:<br>• **Permission-denied** — host permission missing for the current origin → overlay never mounts; side panel surfaces a content-script error banner<br>• **Fiber lookup failed** — production build / source maps missing / non-React page → layers still render correctly, but tooltip omits `componentName` and the side-panel `ElementCard` will later show `No React component detected` | For permission-denied: nothing on the page (error routed to side panel). For Fiber failure: overlay looks normal, just missing the component-name segment in the tooltip | Grant permission and reload / select a different element / fall back to DOM-only selection |

## Copy

The overlay has no prose copy. The tooltip is three mono fields joined by a dot separator:

| Key / Location | Copy | Notes |
| -------------- | ---- | ----- |
| Tooltip · tag       | `{TAGNAME}{#id}{.class}` | Monospaced, `--ip-text-primary` tone |
| Tooltip · size      | `{w}×{h}` | px values |
| Tooltip · component | `{componentName}` | Omitted when Fiber lookup returns nothing |

## Responsive Behavior

The overlay tracks the host page's layout, so it is inherently responsive. Nothing to do at the overlay level.

| Breakpoint         | Layout adjustments |
| ------------------ | ------------------ |
| Mobile (<768px)    | n/a — Chrome side panel is desktop-only |
| Tablet (768–1024)  | n/a |
| Desktop (>1024px)  | Layers reposition on every `mousemove` using `transform`; no breakpoint logic |

## Accessibility

- **Tab order:** n/a — overlay is not focusable; interaction is pointer + ESC only.
- **Focus management:** ESC key listener lives on the document while inspect mode is active; no focus is trapped.
- **Keyboard shortcuts:** `Esc` cancels.
- **ARIA labels:** The overlay host element uses `aria-hidden="true"` (inferred from shadow-DOM isolation). The tooltip is decorative — the real element data is echoed into the side panel, which is the accessible surface.
- **Screen reader flow:** SR users will not use the overlay; they are served by the side panel's `ElementCard` once selection is committed.

## Motion & Feedback

- **Enter / exit:** The overlay fades in on hover and snaps off on click — no explicit animation today; frame-to-frame repaint.
- **State transitions:** Layer positions update on every `mousemove` frame; throttling is handled inside `InspectMode`.
- **Hover / press feedback:** The cursor itself is the feedback.
- **Performance:** Target ≥ 50fps hover tracking (PRD NFR). Layers animate only `transform`/positioning on resize; no filter/backdrop effects.

## Edge Cases

- Element is off-screen or partially scrolled → layers clamp to `position: fixed` coords from `getBoundingClientRect`.
- Element is inside an iframe → not supported in v1.
- Page uses its own Shadow DOM → outer host can still be targeted; deep-shadow children are not.
- User opens DevTools over the target → the overlay continues to track; DevTools' own highlight may render on top.
- The React Fiber lookup fails (production build without source maps / non-React) → tooltip omits `componentName`; `ElementCard` in the side panel will show `No React component detected`.
- Tab navigates while the overlay is active → `ctx.onInvalidated` tears down host; inspect mode resets next load.

## Analytics / Events

n/a — zero-upload promise.

| Event name | Trigger | Properties |
| ---------- | ------- | ---------- |
| n/a | n/a | n/a |

## Open Questions

- Should we support iframes (common in modern React apps — Storybook, embedded previews)?
- Should layer colours be themable (some developers find the default devtools palette visually heavy on light pages)?
- Add a 100ms fade on layer appearance to soften the snap?

## Out of Scope

- Targeting SVG internals (below `<svg>` root).
- Non-React component names (Vue / Svelte / Angular) — see PRD Non-Goals.
- Multi-select.
- Keyboard-driven element selection — pointer is the only selector today.
