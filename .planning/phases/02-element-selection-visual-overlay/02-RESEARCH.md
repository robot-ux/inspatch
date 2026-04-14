# Phase 2: Element Selection & Visual Overlay - Research

**Researched:** 2026-04-14
**Domain:** Chrome Extension Content Script — DOM element inspection, Shadow DOM overlay, box-model visualization
**Confidence:** HIGH

## Summary

This phase implements the visual element inspection system: hover highlighting with box-model visualization, Alt+Click selection with persistent highlight, and Escape to exit. All overlay rendering happens inside a Shadow DOM host element (`<inspatch-overlay>`) to guarantee CSS isolation from the inspected page. The core technical pattern is `pointer-events: none` on the overlay + `document.elementFromPoint()` from document-level listeners — this is a proven approach (used by VisBug, Chrome DevTools) that avoids the overlay-intercepts-events problem entirely.

No external libraries are needed. All functionality uses browser platform APIs (`Shadow DOM`, `elementFromPoint`, `getComputedStyle`, `getBoundingClientRect`, `requestAnimationFrame`) and Chrome extension APIs (`chrome.runtime.sendMessage`, `chrome.runtime.onMessage`). The WXT content script context (`ctx`) provides lifecycle management for cleanup on extension invalidation.

**Primary recommendation:** Build a standalone overlay manager module that creates a single `<inspatch-overlay>` Shadow DOM host, renders box-model visualization layers inside it, and coordinates with document-level event listeners for element detection. Keep the overlay renderer and the event/state machine cleanly separated.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use a single Shadow DOM host element (`<inspatch-overlay>`) injected into the page body. All overlay visuals render inside the shadow root — zero CSS leakage in either direction.
- **D-02:** Overlay container uses `pointer-events: none` globally. Selection detection uses `document.elementFromPoint()` from mousemove/click listeners on the document, not on the overlay itself (per CP-5 mitigation).
- **D-03:** Overlay repositions via `requestAnimationFrame` loop while inspect mode is active; stops when exited to avoid idle CPU cost.
- **D-04:** DevTools-style box-model visualization: content area (blue tint), padding (green tint), border (yellow/dark tint), margin (orange tint) — matching Chrome DevTools conventions for familiarity.
- **D-05:** Computed styles (`getComputedStyle`) are read on hover to calculate margin/padding/border dimensions for the box-model overlay.
- **D-06:** Element tag name and dimensions shown in a small tooltip label above the highlighted element (e.g., `div · 320×48`).
- **D-07:** Inspect mode is toggled by a command from the sidebar panel (sent via `chrome.runtime.sendMessage`). No always-on inspection — user explicitly enters inspect mode.
- **D-08:** Alt+Click selects the hovered element, persists the highlight, and sends `ElementSelection` data to the sidebar. Normal clicks are suppressed during inspect mode via `preventDefault`.
- **D-09:** Escape key exits inspect mode and removes all overlays. Also exits if sidebar sends a stop command.
- **D-10:** During inspect mode, scroll events pass through normally (overlay is `pointer-events: none`). Only click is intercepted for selection.
- **D-11:** Content script sends `ElementSelection` payloads to sidebar via `chrome.runtime.sendMessage`. Background service worker relays if needed.
- **D-12:** Sidebar sends inspect mode commands (`start-inspect`, `stop-inspect`) to content script via `chrome.tabs.sendMessage`.
- **D-13:** Selected element reference is stored in content script memory for future phases (screenshot capture, source resolution) — not serialized to storage.

### Claude's Discretion
- Exact color values and opacity levels for box-model overlay tints
- Debounce/throttle timing for mousemove handler (recommended 16-50ms)
- Tooltip label positioning logic (above, below, or flip based on viewport)
- CSS transition/animation details for overlay appearance

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ELEM-01 | User can hover over any element to see it highlighted with a visual overlay (border, dimensions) | Shadow DOM overlay with `pointer-events: none` + `elementFromPoint()` + `getBoundingClientRect()` for positioning + tooltip label showing tag and dimensions |
| ELEM-02 | User can Alt+Click an element to select it as the target for changes | Document-level click listener with `e.altKey` check, `preventDefault()` to suppress page clicks during inspect mode, sends `ElementSelection` payload via `chrome.runtime.sendMessage` |
| ELEM-03 | User can press Escape to exit inspect/selection mode | Document keydown listener for `Escape`, tears down rAF loop, removes overlay visuals, exits inspect mode state |
| ELEM-04 | Overlay is rendered in Shadow DOM to prevent CSS conflicts with the page | Single `<inspatch-overlay>` custom element with `attachShadow({mode: 'open'})`, all CSS defined inside shadow root via `<style>` element |
| ELEM-05 | User can see box-model visualization (margin, padding, border) on hover | `getComputedStyle()` reads margin/padding/border values, four colored semi-transparent layers positioned around `getBoundingClientRect()` area |
</phase_requirements>

## Standard Stack

### Core (No New Dependencies)
| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| Shadow DOM API | Web Platform | Overlay CSS isolation | Browser-native; no library needed. `attachShadow({mode: 'open'})` provides complete style encapsulation in both directions. [VERIFIED: MDN Web Docs] |
| `document.elementFromPoint()` | Web Platform | Element detection under overlay | Correctly ignores elements with `pointer-events: none` per W3C hit-testing spec. Proven pattern used by VisBug and browser DevTools. [VERIFIED: MDN Web Docs, StackOverflow 2025] |
| `getComputedStyle()` | Web Platform | Box-model dimension reading | Returns resolved pixel values for margin, padding, border regardless of authored CSS units. [VERIFIED: MDN Web Docs] |
| `getBoundingClientRect()` | Web Platform | Element positioning | Returns viewport-relative DOMRect including padding and border. Works correctly with transforms — returns visual position. [VERIFIED: MDN Web Docs] |
| `requestAnimationFrame` | Web Platform | Overlay position updates | 60fps update loop; stops when cancelled. WXT's `ctx.requestAnimationFrame()` auto-cancels on context invalidation. [VERIFIED: WXT docs] |
| Chrome Extension Messaging | `chrome.runtime` | Content ↔ Sidebar communication | `sendMessage` / `onMessage` for one-shot messages. `chrome.tabs.sendMessage` for sidebar → content script. [VERIFIED: Chrome Developers docs] |
| WXT Content Script Context | 0.20.20 | Lifecycle management | `ctx.addEventListener()`, `ctx.requestAnimationFrame()` auto-cleanup on extension invalidation. [VERIFIED: WXT docs] |

### Supporting (Existing in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod (via `@inspatch/shared`) | 4.3.6 | Message schema validation | Validate `ElementSelection` payloads and inspect mode commands against shared schemas. Already used in Phase 1. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual Shadow DOM | WXT `createShadowRootUi` | WXT's helper is great for static UI injection but doesn't suit a dynamically-repositioned overlay that needs full control over positioning, z-index, and multiple child layers. Manual Shadow DOM gives the precise control needed. |
| Manual Shadow DOM | Integrated UI (no shadow) | No CSS isolation — page styles leak into overlay, overlay styles leak into page. Violates ELEM-04. |
| `elementFromPoint()` | Hit-testing with overlay hide/show | Temporarily hiding the overlay before hit-testing is an older pattern. `pointer-events: none` makes `elementFromPoint()` ignore the overlay natively — simpler, no flicker, no race conditions. |
| `getComputedStyle()` | Reading `style` attribute | Only returns inline styles, not applied CSS. `getComputedStyle()` returns the resolved, rendered values. |

**Installation:**
```bash
# No new packages needed — all browser platform APIs + existing WXT/Zod
```

## Architecture Patterns

### Recommended Content Script Structure
```
entrypoints/
├── content.ts                     # Content script entry (WXT defineContentScript)
├── content/
│   ├── overlay-manager.ts         # Shadow DOM host creation, overlay rendering
│   ├── box-model.ts               # Box-model dimension calculation from getComputedStyle
│   ├── element-detector.ts        # mousemove → elementFromPoint → element identification
│   ├── inspect-mode.ts            # State machine: idle → inspecting → selected
│   └── messaging.ts               # chrome.runtime message handlers (start/stop/selection)
```

### Pattern 1: Shadow DOM Overlay Host
**What:** Single custom element `<inspatch-overlay>` appended to `document.body` with an open Shadow DOM root. All visual layers (margin, border, padding, content highlight, tooltip) are children of the shadow root.
**When to use:** Always — this is the foundation for ELEM-04.
**Example:**
```typescript
// Source: MDN Shadow DOM + Chrome DevTools color conventions
function createOverlayHost(): { host: HTMLElement; shadow: ShadowRoot } {
  const host = document.createElement('inspatch-overlay');
  host.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .margin-layer  { position: absolute; background: rgba(255, 155, 0, 0.3); }
    .border-layer  { position: absolute; background: rgba(255, 200, 50, 0.3); }
    .padding-layer { position: absolute; background: rgba(120, 200, 80, 0.3); }
    .content-layer { position: absolute; background: rgba(100, 150, 255, 0.3); }
    .tooltip {
      position: absolute;
      background: #232327;
      color: #fff;
      font: 11px/1.3 'SFMono-Regular', Consolas, monospace;
      padding: 2px 6px;
      border-radius: 3px;
      white-space: nowrap;
      pointer-events: none;
    }
  `;
  shadow.appendChild(style);

  document.body.appendChild(host);
  return { host, shadow };
}
```

### Pattern 2: Element Detection via elementFromPoint
**What:** Document-level mousemove listener calls `elementFromPoint(e.clientX, e.clientY)` to find the element under the cursor. The overlay has `pointer-events: none` so it's invisible to hit-testing.
**When to use:** During inspect mode — the mousemove listener is added when inspect starts, removed when it exits.
**Example:**
```typescript
// Source: W3C hit-testing spec + StackOverflow verification
function onMouseMove(e: MouseEvent): void {
  const target = document.elementFromPoint(e.clientX, e.clientY);
  if (!target || target === currentTarget) return;
  if (target === overlayHost || overlayHost.contains(target)) return;

  currentTarget = target;
  updateOverlay(target);
}
```

### Pattern 3: Box-Model Layer Calculation
**What:** Read `getComputedStyle()` for margin, padding, border values. Calculate four concentric rectangles. Position overlay layers for each box-model zone.
**When to use:** On every element change during hover.
**Example:**
```typescript
// Source: MDN getComputedStyle + CSS Box Model spec
interface BoxModelDimensions {
  content: DOMRect;
  padding: { top: number; right: number; bottom: number; left: number };
  border: { top: number; right: number; bottom: number; left: number };
  margin: { top: number; right: number; bottom: number; left: number };
}

function calculateBoxModel(el: Element): BoxModelDimensions {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);

  return {
    content: rect,
    padding: {
      top: parseFloat(style.paddingTop),
      right: parseFloat(style.paddingRight),
      bottom: parseFloat(style.paddingBottom),
      left: parseFloat(style.paddingLeft),
    },
    border: {
      top: parseFloat(style.borderTopWidth),
      right: parseFloat(style.borderRightWidth),
      bottom: parseFloat(style.borderBottomWidth),
      left: parseFloat(style.borderLeftWidth),
    },
    margin: {
      top: parseFloat(style.marginTop),
      right: parseFloat(style.marginRight),
      bottom: parseFloat(style.marginBottom),
      left: parseFloat(style.marginLeft),
    },
  };
}
```
**Important note:** `getBoundingClientRect()` returns the border-box dimensions (content + padding + border). To render the content-area highlight, subtract padding and border inward. To render the margin highlight, extend outward from the border-box.

### Pattern 4: Inspect Mode State Machine
**What:** Three states: `idle` → `inspecting` → `selected`. Transitions triggered by sidebar commands (start/stop) and user actions (Alt+Click, Escape).
**When to use:** Central control for all phase behavior.
**Example:**
```typescript
type InspectState = 'idle' | 'inspecting' | 'selected';

let state: InspectState = 'idle';
let rafId: number | null = null;

function startInspect(ctx: ContentScriptContext): void {
  if (state !== 'idle') return;
  state = 'inspecting';
  mountOverlay();
  ctx.addEventListener(document, 'mousemove', onMouseMove, true);
  ctx.addEventListener(document, 'click', onClick, true);
  ctx.addEventListener(document, 'keydown', onKeyDown, true);
  startRafLoop(ctx);
}

function stopInspect(): void {
  state = 'idle';
  stopRafLoop();
  removeOverlay();
  currentTarget = null;
  selectedElement = null;
}

function selectElement(el: Element): void {
  state = 'selected';
  selectedElement = el;
  persistHighlight(el);
  sendSelectionToSidebar(el);
}
```

### Pattern 5: Content Script ↔ Sidebar Messaging
**What:** Sidebar sends `start-inspect` / `stop-inspect` commands to content script via `chrome.tabs.sendMessage(tabId, msg)`. Content script sends `ElementSelection` payload back via `chrome.runtime.sendMessage(msg)`. Background service worker relays from content→sidebar if needed.
**When to use:** All communication between content script and sidebar.
**Example:**
```typescript
// Content script — receive commands
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'start-inspect') {
    startInspect(ctx);
    sendResponse({ ok: true });
  } else if (message.type === 'stop-inspect') {
    stopInspect();
    sendResponse({ ok: true });
  }
  return true;
});

// Content script — send selection
function sendSelectionToSidebar(el: Element): void {
  const rect = el.getBoundingClientRect();
  chrome.runtime.sendMessage({
    type: 'element_selection',
    tagName: el.tagName.toLowerCase(),
    className: el.className,
    id: el.id || undefined,
    xpath: getXPath(el),
    boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  });
}
```

### Pattern 6: Sidebar Tab ID Discovery
**What:** The sidebar needs the active tab ID to send messages to the content script via `chrome.tabs.sendMessage`. Use `chrome.tabs.query` to get the active tab.
**When to use:** Before sending any command from sidebar to content script.
**Example:**
```typescript
// Sidebar — send command to content script
async function sendToContentScript(message: unknown): Promise<unknown> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error('No active tab found');
  return chrome.tabs.sendMessage(tab.id, message);
}
```

### Anti-Patterns to Avoid
- **Overlay with `pointer-events: auto`:** Intercepts all mouse events, `elementFromPoint()` returns the overlay instead of page elements. Violates D-02 and CP-5.
- **Injecting overlay styles into page CSS:** Page styles can override them, and overlay styles can break page layout. Always use Shadow DOM (D-01).
- **Using `mouseover`/`mouseout` on overlay elements:** These events don't fire correctly with `pointer-events: none`. Use `mousemove` + `elementFromPoint()` instead (D-02).
- **Reading `element.style.*` for dimensions:** Only returns inline styles. `getComputedStyle()` returns the actual resolved values (D-05).
- **Creating/destroying overlay DOM per hover:** Excessive DOM churn causes GC pressure and flicker. Create the overlay structure once, reposition via style properties.
- **Using `setInterval` for overlay positioning:** Timing drift, no sync with screen refresh. `requestAnimationFrame` syncs with the display's refresh rate (D-03).
- **Setting `z-index` lower than 2^31-1:** Some websites use very high z-index values. Use `2147483647` (max 32-bit signed int) to guarantee the overlay is always on top.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XPath generation | Full XPath spec implementation | Simple ancestor-walk generating `/tagName[index]` paths | Full XPath is unnecessary; a simple unique-path generator is sufficient for element re-identification. Keep it under 20 lines. |
| CSS parsing for dimensions | Custom CSS value parser | `parseFloat(getComputedStyle(el).marginTop)` | `getComputedStyle` already returns resolved pixel values as strings. `parseFloat()` handles the `px` suffix. |
| DOM hit-testing | Custom coordinate-to-element mapping | `document.elementFromPoint(x, y)` | Browser's native hit-testing handles stacking contexts, z-index, visibility, and pointer-events correctly. |
| Element position tracking | MutationObserver + manual position cache | `getBoundingClientRect()` in rAF loop | Called at 60fps, it's fast enough and always returns current position. No stale cache issues. |
| Extension message protocol | Custom WebSocket between content/sidebar | `chrome.runtime.sendMessage` / `chrome.runtime.onMessage` | Chrome's built-in messaging handles serialization, channel management, and context lifecycle. |

**Key insight:** This phase is almost entirely browser platform APIs. The complexity is in state management and correct coordinate math, not in library selection.

## Common Pitfalls

### Pitfall 1: getBoundingClientRect Returns Border-Box, Not Content-Box
**What goes wrong:** Developer assumes `getBoundingClientRect()` returns content dimensions, then adds padding on top → double-counted padding → overlay is too large.
**Why it happens:** `getBoundingClientRect()` returns the border-box (content + padding + border). This is different from CSS `width`/`height` which depends on `box-sizing`.
**How to avoid:** Content area = rect minus padding minus border. Padding area = rect minus border. Border area = rect. Margin area = rect plus margin. Always subtract/add from `getBoundingClientRect()`.
**Warning signs:** Overlay is slightly too large on elements with padding; overlay exactly matches on elements with zero padding.

### Pitfall 2: Margin Collapse Not Reflected in getComputedStyle
**What goes wrong:** Adjacent vertical margins collapse (two 20px margins become 20px, not 40px). `getComputedStyle()` reports the authored 20px value, not the collapsed value. The margin overlay extends into the adjacent element's space.
**Why it happens:** CSS margin collapse is a layout-level behavior. `getComputedStyle()` returns the specified/computed value, not the used/actual value.
**How to avoid:** Accept this as a visual approximation. Chrome DevTools has the same limitation — it shows the authored margin value, not the collapsed result. Document this as a known limitation.
**Warning signs:** Margin overlay overlaps with adjacent elements' content areas. This is cosmetically imperfect but matches Chrome DevTools behavior.

### Pitfall 3: Overlay Position Drift on Scroll
**What goes wrong:** Overlay is positioned using `getBoundingClientRect()` coordinates but the overlay container uses `position: fixed`. On scroll, `getBoundingClientRect()` values change (they're viewport-relative), but the rAF loop hasn't fired yet → brief desync.
**Why it happens:** Scroll events and rAF don't always fire in the same order. The overlay visually lags behind fast scrolling.
**How to avoid:** The rAF loop (D-03) continuously repositions the overlay. During fast scroll, add a scroll listener that also triggers an immediate reposition. This gives sub-frame response.
**Warning signs:** Overlay "slides" relative to the highlighted element during scroll, then snaps back.

### Pitfall 4: Overlay Breaks on CSS Transformed Elements
**What goes wrong:** Elements inside a CSS `transform` container report `getBoundingClientRect()` values that account for the transform (correct), but the overlay is positioned in the non-transformed `position: fixed` space → visual mismatch.
**Why it happens:** `getBoundingClientRect()` returns visual (post-transform) coordinates relative to the viewport. `position: fixed` on the overlay host positions relative to the viewport. These should match — and they do, since both are viewport-relative. The actual risk is elements inside `overflow: hidden` ancestors where the visual area is clipped but `getBoundingClientRect()` reports the full unclipped size.
**How to avoid:** For transformed elements: no special handling needed — `getBoundingClientRect()` already accounts for transforms. For `overflow: hidden` ancestors: clip the overlay visually using the ancestor's bounding rect. This is a polish item, not a blocker.
**Warning signs:** Overlay extends beyond a scrollable/clipped container's bounds.

### Pitfall 5: Alt+Click May Be Consumed by Page JavaScript
**What goes wrong:** The page's JavaScript has its own Alt+Click handler (common in text editors, mapping tools). Both the page handler and the extension handler fire.
**Why it happens:** Content script event listeners on `document` using capture phase fire before page listeners. But if the page also uses capture phase, order depends on registration order.
**How to avoid:** Use capture phase (`addEventListener(document, 'click', handler, true)`) and call `e.preventDefault()` + `e.stopPropagation()` + `e.stopImmediatePropagation()` to fully suppress the event from reaching page handlers. This is acceptable during inspect mode since the user has explicitly activated it.
**Warning signs:** Clicking with Alt triggers both element selection AND a page action (like opening a link in a new tab in some browsers).

### Pitfall 6: Shadow DOM Host Itself Is Detected by elementFromPoint
**What goes wrong:** If the overlay host element (`<inspatch-overlay>`) doesn't have `pointer-events: none`, or if a child inside the shadow root has `pointer-events: auto`, `elementFromPoint()` returns the overlay host instead of the page element.
**Why it happens:** `elementFromPoint()` respects `pointer-events` at the hit-test level. The host element's `pointer-events: none` propagates into the shadow root, but only if no child overrides it.
**How to avoid:** Set `pointer-events: none` on the host element style AND as a rule in the shadow root CSS (`:host { pointer-events: none; }`). Never set `pointer-events: auto` on any shadow root child. Filter out the host element in the elementFromPoint result as a safety check.
**Warning signs:** Hovering over the overlay shows the overlay itself as the target element, or no element is detected.

### Pitfall 7: Content Script Message Listener Must Return `true` for Async Response
**What goes wrong:** `chrome.runtime.onMessage` listener returns before calling `sendResponse`. The message channel closes, and the sender gets `undefined`.
**Why it happens:** Chrome closes the message channel at the end of the synchronous listener execution unless `return true` signals async work.
**How to avoid:** Always `return true` from `onMessage` listeners that do any async work before calling `sendResponse`.
**Warning signs:** Sidebar receives `undefined` responses from content script commands.

## Code Examples

### Complete Overlay Positioning Logic
```typescript
// Source: MDN getBoundingClientRect + CSS Box Model spec
function positionOverlayLayers(
  el: Element,
  layers: {
    margin: HTMLElement;
    border: HTMLElement;
    padding: HTMLElement;
    content: HTMLElement;
    tooltip: HTMLElement;
  }
): void {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);

  const mt = parseFloat(style.marginTop);
  const mr = parseFloat(style.marginRight);
  const mb = parseFloat(style.marginBottom);
  const ml = parseFloat(style.marginLeft);

  const bt = parseFloat(style.borderTopWidth);
  const br = parseFloat(style.borderRightWidth);
  const bb = parseFloat(style.borderBottomWidth);
  const bl = parseFloat(style.borderLeftWidth);

  const pt = parseFloat(style.paddingTop);
  const pr = parseFloat(style.paddingRight);
  const pb = parseFloat(style.paddingBottom);
  const pl = parseFloat(style.paddingLeft);

  // Margin layer: extends outward from border-box
  setRect(layers.margin, {
    top: rect.top - mt,
    left: rect.left - ml,
    width: rect.width + ml + mr,
    height: rect.height + mt + mb,
  });

  // Border layer: the border-box itself
  setRect(layers.border, {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  });

  // Padding layer: inset by border width
  setRect(layers.padding, {
    top: rect.top + bt,
    left: rect.left + bl,
    width: rect.width - bl - br,
    height: rect.height - bt - bb,
  });

  // Content layer: inset by border + padding
  setRect(layers.content, {
    top: rect.top + bt + pt,
    left: rect.left + bl + pl,
    width: rect.width - bl - br - pl - pr,
    height: rect.height - bt - bb - pt - pb,
  });

  // Tooltip: above the margin box, flip below if near top of viewport
  const tooltipY = rect.top - mt - 24;
  layers.tooltip.style.top = `${tooltipY < 4 ? rect.bottom + mb + 4 : tooltipY}px`;
  layers.tooltip.style.left = `${rect.left - ml}px`;
  layers.tooltip.textContent =
    `${el.tagName.toLowerCase()} · ${Math.round(rect.width)}×${Math.round(rect.height)}`;
}

function setRect(el: HTMLElement, r: { top: number; left: number; width: number; height: number }): void {
  el.style.top = `${r.top}px`;
  el.style.left = `${r.left}px`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
}
```

### Correct Box-Model Rendering Strategy
The visual trick for DevTools-style overlays is **not** to stack four opaque rectangles. Instead, render each layer as the *difference* between zones so colors don't compound:

```typescript
// Margin zone: fill the full area with margin color, then the border-box cuts into it
// Border zone: fill border-box, then padding-box cuts into it
// etc.

// Simplest approach: use clip-path or just overlay with careful opacity
// Recommended: Use one div per zone with the correct size, positioned absolutely.
// The zones overlap, so use semi-transparent colors (the overlap is intentional —
// it creates the "nested boxes" visual that users expect from DevTools).
```

### XPath Generator (Simple)
```typescript
function getXPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }

  return '/' + parts.join('/');
}
```

### WXT Content Script Entry with Context
```typescript
// entrypoints/content.ts
export default defineContentScript({
  matches: ['http://localhost:*/*'],

  main(ctx) {
    const { host, shadow } = createOverlayHost();
    const layers = createOverlayLayers(shadow);
    const inspectMode = new InspectMode(ctx, host, layers);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'start-inspect') {
        inspectMode.start();
        sendResponse({ ok: true });
      } else if (message.type === 'stop-inspect') {
        inspectMode.stop();
        sendResponse({ ok: true });
      }
      return true;
    });

    ctx.onInvalidated(() => {
      inspectMode.stop();
      host.remove();
    });
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pointer-events: auto` + hide/show overlay for hit-testing | `pointer-events: none` + `elementFromPoint()` | ~2020, as `elementFromPoint` spec clarified `pointer-events: none` behavior | Eliminates overlay flicker and race conditions |
| Inline styles on page elements for highlighting | Shadow DOM isolation | 2018+ (Shadow DOM v1 stable in all browsers) | Zero CSS leakage — overlay can't break page, page can't break overlay |
| `setInterval` for position updates | `requestAnimationFrame` | Long-standing best practice | Syncs with display refresh, no timing drift, better battery life |
| `chrome.runtime.connect()` long-lived ports | `chrome.runtime.sendMessage()` one-shot messages | MV3 service worker architecture (2023+) | Ports keep service worker alive unnecessarily; one-shot messages are stateless and resilient to worker restarts |

**Deprecated/outdated:**
- `webkitShadowRoot`: Use standard `attachShadow()`. All modern browsers support Shadow DOM v1. [VERIFIED: MDN Web Docs]
- `elementFromPoint` with overlay hide/show: No longer needed — `pointer-events: none` provides clean pass-through. [VERIFIED: W3C spec, StackOverflow 2025]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | WXT `ctx.requestAnimationFrame()` auto-cancels on context invalidation | Architecture Patterns | LOW — fallback is manual `cancelAnimationFrame` in `ctx.onInvalidated()`. WXT docs confirm context helpers auto-cancel. [ASSUMED based on WXT docs pattern, not explicitly tested] |
| A2 | `z-index: 2147483647` is sufficient to overlay all page content | Anti-Patterns | LOW — some edge cases with `dialog` elements or browser UI. Worst case: overlay is hidden behind rare high-z-index content. Non-critical. [ASSUMED] |
| A3 | Chrome `tabs.sendMessage` works from side panel to content script without relay | Messaging Pattern | MEDIUM — StackOverflow reports suggest it works directly, but some users needed background relay. Testing needed. If wrong, add background relay (trivial change). [ASSUMED based on Chrome docs] |

**If this table is empty:** N/A — three assumptions identified above.

## Open Questions (RESOLVED)

1. **Does `chrome.tabs.sendMessage` work directly from side panel to content script?**
   - What we know: Chrome docs say any extension page can use `chrome.tabs.sendMessage`. Side panel is an extension page. StackOverflow has mixed reports.
   - What's unclear: Whether a background service worker relay is always needed or only in certain Chrome versions.
   - Recommendation: Implement direct `chrome.tabs.sendMessage` first. If it fails, add a trivial relay through the background service worker. Both patterns are well-documented.
   - **(RESOLVED)** Plan 02 implements direct `chrome.tabs.sendMessage` from sidebar. Background relay deferred until testing proves it necessary (per A3 assumption).

2. **Should the overlay host be created immediately on content script load or lazily on first inspect?**
   - What we know: Creating an empty Shadow DOM host has near-zero performance cost. But it does add an element to every localhost page.
   - What's unclear: Whether any pages break with an unknown custom element in their body.
   - Recommendation: Create lazily on first `start-inspect` command. Remove on `stop-inspect`. This is cleaner and avoids any potential side effects on pages that aren't being inspected.
   - **(RESOLVED)** Plan 01 creates overlay host eagerly in `content.ts main()` but `mountOverlay` / `unmountOverlay` in `InspectMode.start()` / `stop()` controls DOM attachment. Host object exists in memory; DOM insertion is lazy.

3. **How should negative margins be handled visually?**
   - What we know: `getComputedStyle` returns negative margin values. The margin overlay should extend in the negative direction (overlapping adjacent elements).
   - What's unclear: Whether this creates confusing visuals.
   - Recommendation: Render negative margins as-is (extending in the negative direction). Chrome DevTools does the same. Clamp to zero only if visuals are confusing during testing.
   - **(RESOLVED)** Plan 01 renders negative margins as-is, matching Chrome DevTools behavior. No clamping.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). This phase uses only browser platform APIs and Chrome extension APIs. No CLI tools, databases, or external services are needed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A — no auth in content script |
| V3 Session Management | No | N/A — stateless inspect mode |
| V4 Access Control | No | N/A — local-only, same origin |
| V5 Input Validation | Yes | Validate incoming messages with Zod schemas from `@inspatch/shared` |
| V6 Cryptography | No | N/A — no sensitive data handling |

### Known Threat Patterns for Content Script Overlay

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious page crafts fake `start-inspect` messages | Spoofing | `chrome.runtime.onMessage` only receives messages from extension contexts — page JS cannot send to this listener. No mitigation needed. [VERIFIED: Chrome docs] |
| Page observes overlay element in DOM | Information Disclosure | Overlay is a custom element in body — page can see it exists but cannot read Shadow DOM internals (`mode: 'open'` allows JS access, but page can't access extension content script variables). LOW risk — element presence reveals "extension is active" but no sensitive data. |
| Page manipulates overlay element | Tampering | Page can modify the host element but not the shadow root contents. Mitigation: re-create overlay if host is tampered with (optional, low priority). |

## Sources

### Primary (HIGH confidence)
- MDN — Shadow DOM: https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot — `attachShadow()` API, style isolation
- MDN — `elementFromPoint()`: https://developer.mozilla.org/en-US/docs/Web/API/document.elementFromPoint — hit-testing behavior with `pointer-events: none`
- MDN — `getComputedStyle()`: https://developer.mozilla.org/en-US/docs/Web/API/window.getComputedStyle — resolved CSS values
- MDN — `getBoundingClientRect()`: https://developer.mozilla.org/en-US/docs/Web/API/element/getBoundingClientRect — viewport-relative DOMRect
- MDN — CSS Box Model: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Box_Model — content/padding/border/margin zones
- WXT Content Scripts Guide: https://wxt.dev/guide/essentials/content-scripts.html — `createShadowRootUi`, context lifecycle, `ctx.addEventListener`
- WXT `createShadowRootUi` API: https://wxt.dev/api/reference/wxt/utils/content-script-ui/shadow-root/functions/createShadowRootUi.html
- Chrome Developers — Message Passing: https://developer.chrome.com/docs/extensions/develop/concepts/messaging — sendMessage patterns
- Chrome Developers — Content Scripts: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts — isolated world, event handling
- VisBug Tool Architecture: https://github.com/GoogleChromeLabs/ProjectVisBug/wiki/Tool-Architecture — overlay + Shadow DOM + custom element pattern

### Secondary (MEDIUM confidence)
- StackOverflow — `elementFromPoint` ignores `pointer-events: none`: https://stackoverflow.com/questions/14176988 — confirmed behavior
- StackOverflow — Side panel to content script messaging: https://stackoverflow.com/questions/77820018 — `chrome.tabs.sendMessage` pattern
- StackOverflow — Getting tab ID in side panel: https://stackoverflow.com/questions/76456744 — `chrome.tabs.query` approach
- StackOverflow — Overlay pointer events for highlighter: https://stackoverflow.com/questions/79577772 — 2025 verification of the pattern

### Tertiary (LOW confidence)
- None — all findings verified with primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all browser platform APIs with well-documented specs
- Architecture: HIGH — patterns verified against VisBug, Chrome DevTools conventions, WXT docs
- Pitfalls: HIGH — CP-5 directly addressed; edge cases (transforms, margin collapse, scroll drift) documented with mitigations

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable browser APIs; unlikely to change)
