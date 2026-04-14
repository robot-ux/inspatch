# Phase 5: Screenshot Capture & Context Assembly - Research

**Researched:** 2026-04-14
**Domain:** Chrome Extension Screenshot APIs, Canvas Image Processing, Sidebar UI
**Confidence:** HIGH

## Summary

This phase captures an element-level screenshot via `chrome.tabs.captureVisibleTab()` + canvas cropping, adds a natural language change description input to the sidebar, and assembles a complete `ChangeRequest` payload for downstream AI processing. The existing sidebar already displays element info (component name, source file/line, bounding rect) from Phase 4 — this phase adds the screenshot display, a textarea input, and payload assembly.

The core technical challenge is calling `captureVisibleTab()` from the side panel context (which works with `host_permissions` but NOT reliably with `activeTab` alone), correctly handling `devicePixelRatio` for Retina displays during canvas cropping, and choosing the right image format/quality to balance clarity and payload size.

**Primary recommendation:** Call `captureVisibleTab()` directly from the side panel (which has both DOM access for canvas cropping and Chrome API access), using `host_permissions: ['http://localhost/*']` already declared in the manifest. Get `devicePixelRatio` from the content script alongside the bounding rect. Use a 200×200px threshold for PNG-vs-JPEG selection.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use `captureVisibleTab` + canvas crop to element's bounding rect. No auto-scroll needed — the user has already scrolled to the element before selecting it.
- **D-02:** Smart format selection — small elements use PNG (lossless), large elements use JPEG (quality threshold TBD, e.g., 80%). Balance between clarity and payload size.
- **D-03:** Include bounding rect position info alongside the screenshot in the ChangeRequest payload — gives Claude spatial context about where the element sits on the page.
- **D-04:** Simple textarea with placeholder examples showing what users can describe (e.g., "Make this button larger", "Change the text color to purple").
- **D-05:** Enter to send, Shift+Enter for newline. Also provide a send button for mouse users.
- **D-06:** Layout order: element info + screenshot (scrollable area) → input fixed at bottom. Chat-like UI pattern — input always accessible.
- **D-07:** Screenshot displays as thumbnail by default (compact), click to expand to full size. Two states: collapsed and expanded.

### Claude's Discretion
- Screenshot size threshold for PNG vs JPEG switch (e.g., 200×200 px)
- Placeholder example text content
- Exact ChangeRequest payload field names and structure (must include: component name, source file, source line, bounding rect, screenshot base64, computed styles subset, description)
- How computed styles are selected (relevant subset vs full dump)

### Deferred Ideas (OUT OF SCOPE)
- Region/area selection tool (drag to select) — belongs in v2 (ESEL-02)
- Rich text editor for change description — overkill for v1, simple textarea sufficient
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SHOT-01 | Element-level screenshot via captureVisibleTab + canvas cropping | captureVisibleTab API verified stable, canvas crop pattern documented with devicePixelRatio handling |
| SHOT-02 | Screenshot included in structured context for Claude Code | ChangeRequest schema extension with screenshotDataUrl (base64), boundingRect, computedStyles |
| SIDE-02 | Natural language change description input | Simple textarea with Enter-to-send, Shift+Enter for newline, send button |
| SIDE-03 | Screenshot displayed in sidebar | Thumbnail with click-to-expand, two-state display (collapsed/expanded) |
</phase_requirements>

## Standard Stack

### Core

No new libraries needed. This phase uses only built-in browser APIs and existing project dependencies.

| API/Library | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| `chrome.tabs.captureVisibleTab()` | Stable (Chrome 5+) | Full-viewport screenshot | Only Chrome API for pixel-accurate tab capture. Returns data URL directly. [VERIFIED: Chrome for Developers docs] |
| Canvas API (`HTMLCanvasElement`) | Web standard | Crop screenshot to element bounds | Available in side panel context (full DOM). Standard image manipulation. [VERIFIED: MDN] |
| `window.devicePixelRatio` | Web standard | Scale crop coordinates for HiDPI | Required for accurate cropping on Retina displays. [VERIFIED: MDN, multiple SO answers] |
| React 19 + Tailwind CSS 4 | Already installed | Sidebar UI additions | Existing project stack for all UI |
| Zod 4 | Already installed | Schema extension for ChangeRequest | Existing project validation layer |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Canvas in side panel | OffscreenCanvas in service worker | Unnecessary complexity — side panel has full DOM access |
| captureVisibleTab | html2canvas | Inaccurate re-rendering, misses modern CSS — already rejected in project stack decisions |
| Manual canvas crop | `createImageBitmap()` + canvas | `createImageBitmap()` adds async step with no benefit for simple rect crops |

## Architecture Patterns

### Screenshot Capture Flow

```
Content Script                Side Panel (App.tsx)              Server
     │                              │                             │
     │  element_selection            │                             │
     │  (+ boundingRect + dpr)       │                             │
     ├─────────────────────────────→ │                             │
     │                              │                             │
     │                    captureVisibleTab()                      │
     │                    ───────────┤                             │
     │                    crop via Canvas                          │
     │                    ───────────┤                             │
     │                              │                             │
     │                    Display screenshot                       │
     │                    User types description                   │
     │                              │                             │
     │                    Assemble ChangeRequest                   │
     │                              ├────────────────────────────→ │
     │                              │     (via WebSocket)          │
```

### Where Each Operation Happens

| Operation | Context | Why |
|-----------|---------|-----|
| Get bounding rect + DPR | Content script | Access to page DOM and `window.devicePixelRatio` of the inspected page |
| Call `captureVisibleTab()` | Side panel | Side panel is an extension page with Chrome API access; `host_permissions` for localhost grants permission |
| Canvas crop | Side panel | Has full DOM access for `document.createElement('canvas')` |
| Display screenshot + input | Side panel | Already renders element info here |
| Assemble ChangeRequest | Side panel | Has all data (selection, screenshot, description) |
| Send ChangeRequest | Side panel | WebSocket hook already available |

### Recommended Component Structure

```
entrypoints/sidepanel/
├── App.tsx                     # Main layout — add screenshot + input sections
├── hooks/
│   ├── useWebSocket.ts         # Existing — send ChangeRequest
│   └── useScreenshot.ts        # NEW — capture + crop logic
└── components/
    ├── ElementCard.tsx          # NEW — extract existing element info display
    ├── ScreenshotView.tsx       # NEW — thumbnail/expanded screenshot
    └── ChangeInput.tsx          # NEW — textarea + send button
```

### Pattern: Screenshot Capture Hook

**What:** Custom React hook encapsulating `captureVisibleTab` → canvas crop → data URL
**When to use:** When element selection arrives with bounding rect

```typescript
// Recommended pattern for useScreenshot hook
async function captureAndCrop(
  boundingRect: { x: number; y: number; width: number; height: number },
  devicePixelRatio: number,
): Promise<string> {
  // 1. Capture visible tab
  const dataUrl = await chrome.tabs.captureVisibleTab(
    undefined, // current window
    { format: 'png', quality: 100 },
  );

  // 2. Load into Image
  const img = await loadImage(dataUrl);

  // 3. Create canvas and crop
  const canvas = document.createElement('canvas');
  const dpr = devicePixelRatio;
  const cropW = boundingRect.width * dpr;
  const cropH = boundingRect.height * dpr;

  canvas.width = cropW;
  canvas.height = cropH;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    img,
    boundingRect.x * dpr,   // source x
    boundingRect.y * dpr,   // source y
    cropW,                   // source width
    cropH,                   // source height
    0, 0,                    // dest x, y
    cropW,                   // dest width
    cropH,                   // dest height
  );

  // 4. Smart format selection
  const isSmall = boundingRect.width <= 200 && boundingRect.height <= 200;
  return canvas.toDataURL(
    isSmall ? 'image/png' : 'image/jpeg',
    isSmall ? undefined : 0.8,
  );
}
```

### Pattern: Content Script DPR Addition

The `sendElementSelection` function in `messaging.ts` must also send `window.devicePixelRatio`:

```typescript
// Add to element_selection payload in messaging.ts
payload.devicePixelRatio = window.devicePixelRatio;
```

The `ElementSelectionSchema` in `schemas.ts` needs a new field:

```typescript
devicePixelRatio: z.number().default(1),
```

### Anti-Patterns to Avoid

- **Capturing in the content script:** Content scripts cannot call `captureVisibleTab()`. Only extension pages (side panel, popup, background) can.
- **Using `activeTab` permission alone for captureVisibleTab from side panel:** Known Chrome bug — `activeTab` doesn't reliably grant permission in side panel context. Use `host_permissions` instead (already declared). [VERIFIED: Chromium issue #40916430, SO #78771475]
- **Ignoring devicePixelRatio:** On Retina displays (DPR=2), the captured image is 2× the viewport dimensions. Failing to multiply crop coordinates by DPR produces incorrect crops. [VERIFIED: Multiple sources]
- **Always capturing as PNG:** Large elements produce massive base64 strings. A full-width hero section at 1440×600 DPR=2 = ~2880×1200 PNG ≈ 3-8MB base64. JPEG at 80% quality ≈ 200-500KB.
- **Storing screenshots in `chrome.storage.local`:** 10MB limit, not designed for image data. Keep in React state (ephemeral). [CITED: CLAUDE.md stack decisions]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-page screenshot | Manual scroll + stitch | `captureVisibleTab()` (visible viewport only) | D-01 says no scroll needed — user already scrolled to element |
| Image format detection | Manual pixel analysis | Canvas `toDataURL()` format parameter | Built-in browser support for PNG/JPEG encoding |
| Image loading from data URL | Manual blob/fetch cycle | `new Image()` + `onload` | Standard browser pattern, handles all data URL formats |
| DPR-aware cropping | Manual coordinate math per display | `window.devicePixelRatio` scaling | Browser provides the exact multiplier |

## Common Pitfalls

### Pitfall 1: captureVisibleTab Rate Limiting
**What goes wrong:** Calling `captureVisibleTab` more than 2 times per second throws an error.
**Why it happens:** Chrome enforces `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND = 2` to prevent abuse. [VERIFIED: Chrome for Developers API docs]
**How to avoid:** Capture once on element selection, cache the result. Don't re-capture on every render or state change.
**Warning signs:** "Tabs.captureVisibleTab rate limit exceeded" error in console.

### Pitfall 2: Stale Bounding Rect After Page Scroll
**What goes wrong:** User selects element, then scrolls before screenshot is captured, producing a misaligned crop.
**Why it happens:** `getBoundingClientRect()` returns viewport-relative coordinates at selection time, but `captureVisibleTab()` captures the current viewport.
**How to avoid:** Capture screenshot immediately upon receiving the element selection — don't defer. The content script sends the message, the side panel receives it and captures in the same event handler.
**Warning signs:** Screenshot shows wrong portion of page, offset by scroll distance.

### Pitfall 3: devicePixelRatio Mismatch
**What goes wrong:** Cropped screenshot is offset or shows wrong region.
**Why it happens:** DPR from the side panel may differ from the inspected page (different zoom levels, or page moved to different display).
**How to avoid:** Send `window.devicePixelRatio` from the content script alongside the bounding rect. Use that value for cropping, not the side panel's own DPR.
**Warning signs:** Crop offset is exactly 2× or 0.5× from expected position.

### Pitfall 4: Canvas Security Taint
**What goes wrong:** `canvas.toDataURL()` throws `SecurityError`.
**Why it happens:** If the image loaded into the canvas has cross-origin content, the canvas becomes tainted. However, `captureVisibleTab()` returns a `data:` URL which is same-origin — this should not happen in practice.
**How to avoid:** Always use the data URL directly from `captureVisibleTab()`, never load cross-origin images onto the crop canvas.
**Warning signs:** SecurityError in console on `toDataURL()` call.

### Pitfall 5: Base64 Payload Size
**What goes wrong:** ChangeRequest payload becomes extremely large (>5MB), causing WebSocket send to be slow or fail.
**Why it happens:** Full-width elements on HiDPI displays generate large screenshots. PNG format for large elements compounds the issue.
**How to avoid:** Smart format selection (D-02): PNG for small elements ≤200×200, JPEG at 80% quality for larger ones. Consider a max dimension cap (e.g., scale down if either dimension exceeds 1920px after DPR scaling).
**Warning signs:** WebSocket send takes >1 second, server receives truncated messages.

### Pitfall 6: Element Not Visible in Viewport
**What goes wrong:** Element is partially or fully outside the visible viewport, resulting in a cropped/empty screenshot.
**Why it happens:** Element may extend beyond viewport edges (e.g., wide tables, tall lists).
**How to avoid:** Clamp crop coordinates to viewport bounds. If the element is partially visible, capture only the visible portion. Per D-01, the user has already scrolled to the element, but edge overlap is still possible.
**Warning signs:** Screenshot is mostly transparent/white or shows adjacent content.

## Code Examples

### captureVisibleTab with Host Permissions (from Side Panel)

```typescript
// Source: Chrome for Developers docs (verified)
// Side panel can call captureVisibleTab directly when host_permissions
// includes the tab's origin. No need to route through service worker.
const dataUrl = await chrome.tabs.captureVisibleTab(
  undefined, // current window
  { format: 'png', quality: 100 }
);
// Returns: "data:image/png;base64,iVBOR..."
```

**Important:** The `format` option defaults to `"jpeg"`. Always capture as PNG initially for lossless source data, then convert to JPEG during the crop step if needed. [VERIFIED: Chrome extensionTypes.ImageDetails docs — format defaults to "jpeg"]

### Canvas Crop with DPR Scaling

```typescript
// Source: Verified pattern from multiple implementations
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function cropScreenshot(
  fullScreenshotUrl: string,
  rect: { x: number; y: number; width: number; height: number },
  dpr: number,
): Promise<string> {
  const img = await loadImage(fullScreenshotUrl);
  const canvas = document.createElement('canvas');

  const sx = rect.x * dpr;
  const sy = rect.y * dpr;
  const sw = rect.width * dpr;
  const sh = rect.height * dpr;

  // Clamp to image bounds
  const clampedW = Math.min(sw, img.width - sx);
  const clampedH = Math.min(sh, img.height - sy);

  canvas.width = clampedW;
  canvas.height = clampedH;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, sx, sy, clampedW, clampedH, 0, 0, clampedW, clampedH);

  // Smart format: PNG for small, JPEG for large
  const isSmall = rect.width <= 200 && rect.height <= 200;
  return canvas.toDataURL(
    isSmall ? 'image/png' : 'image/jpeg',
    isSmall ? undefined : 0.80,
  );
}
```

### Computed Styles Subset

```typescript
// Curated list of CSS properties most useful for AI to understand element styling
const RELEVANT_STYLE_PROPERTIES = [
  // Layout
  'display', 'position', 'width', 'height', 'min-width', 'min-height',
  'max-width', 'max-height', 'margin', 'padding', 'box-sizing',
  // Flex/Grid
  'flex-direction', 'justify-content', 'align-items', 'gap',
  'grid-template-columns', 'grid-template-rows',
  // Typography
  'font-family', 'font-size', 'font-weight', 'line-height',
  'color', 'text-align', 'text-decoration', 'letter-spacing',
  // Visual
  'background-color', 'background-image', 'border', 'border-radius',
  'opacity', 'box-shadow', 'overflow',
] as const;

function extractRelevantStyles(el: Element): Record<string, string> {
  const computed = window.getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const prop of RELEVANT_STYLE_PROPERTIES) {
    const value = computed.getPropertyValue(prop);
    // Skip defaults/empty to reduce payload
    if (value && value !== 'none' && value !== 'normal' && value !== 'auto') {
      styles[prop] = value;
    }
  }
  return styles;
}
```

### ChangeRequest Schema Extension

```typescript
// Extension to existing ChangeRequestSchema in packages/shared/src/schemas.ts
export const ChangeRequestSchema = z.object({
  type: z.literal("change_request"),
  requestId: z.string(),
  description: z.string().min(1),
  elementXpath: z.string(),
  componentName: z.string().optional(),
  parentChain: z.array(z.string()).optional(),
  sourceFile: z.string().optional(),
  sourceLine: z.number().optional(),
  sourceColumn: z.number().optional(),
  screenshotDataUrl: z.string().optional(),
  boundingRect: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),
  computedStyles: z.record(z.string(), z.string()).optional(),
});
```

### Textarea with Enter-to-Send

```typescript
// Pattern for Enter-to-send, Shift+Enter-for-newline
function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSubmit();
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `html2canvas` for element screenshots | `captureVisibleTab()` + canvas crop | Always (for extensions) | Pixel-perfect capture vs re-rendered approximation |
| Capture in background, send to content script | Capture in side panel directly | Chrome 114+ (Side Panel API) | Simpler architecture — side panel has both DOM and Chrome API access |
| Fixed PNG format for all screenshots | Smart PNG/JPEG selection based on element size | Current best practice | 10-50× size reduction for large elements with minimal quality loss |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `host_permissions: ['http://localhost/*']` grants `captureVisibleTab` access from side panel (vs known `activeTab` bug) | Architecture Patterns | Capture fails from side panel; would need to route through service worker message passing |
| A2 | 200×200 px is a reasonable PNG-vs-JPEG threshold | Code Examples | Either wasted bytes (threshold too high) or unnecessary compression artifacts (too low) — easily tuned |
| A3 | 80% JPEG quality provides acceptable visual clarity for Claude Code | Code Examples | Low quality screenshots may confuse Claude's visual analysis; can be tuned to 85-90% if needed |
| A4 | The ~30 computed style properties in the curated list are sufficient for Claude to understand element styling | Code Examples | Claude may benefit from additional properties or fewer; can be adjusted after testing |
| A5 | `window.devicePixelRatio` from content script always matches the DPR used by `captureVisibleTab` | Common Pitfalls | Mismatched DPR causes crop offset; would need to determine DPR empirically from captured image dimensions |

## Open Questions

1. **host_permissions vs activeTab from side panel**
   - What we know: `activeTab` has a known Chrome bug for side panels (Chromium issue #40916430). `host_permissions` is the documented workaround.
   - What's unclear: Whether `host_permissions: ['http://localhost/*']` (scoped) works as well as `<all_urls>` from side panel context.
   - Recommendation: Test early. The manifest already declares `host_permissions: ['http://localhost/*']`. If it fails, fall back to routing capture through the service worker via message passing.

2. **Computed styles extraction location**
   - What we know: `window.getComputedStyle()` must be called from content script (access to page DOM).
   - What's unclear: Whether to send computed styles with the initial element_selection message or on-demand when assembling the ChangeRequest.
   - Recommendation: Send with element_selection (one message, no extra round-trip). Add `computedStyles` field to `ElementSelectionSchema`.

3. **Max screenshot dimensions**
   - What we know: Large elements on HiDPI displays can produce enormous screenshots (e.g., 2880×2400 at DPR=2).
   - What's unclear: What Claude Code can effectively process (base64 image size limits).
   - Recommendation: Cap at 1920px on the longest dimension after DPR scaling. Scale down proportionally if exceeded.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A — local-only tool |
| V3 Session Management | No | N/A — no user sessions |
| V4 Access Control | No | N/A — single-user local tool |
| V5 Input Validation | Yes | Zod schema validation on ChangeRequest before WebSocket send |
| V6 Cryptography | No | N/A — no encryption needed for localhost communication |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Oversized payload DoS | Denial of Service | Max screenshot dimension cap, validate payload size before send |
| XSS via description field | Tampering | Zod `.min(1)` + server-side validation; description is passed to Claude CLI, not rendered as HTML |
| Data URL injection in screenshotDataUrl | Tampering | Validate data URL prefix (`data:image/`) before including in payload |

## Sources

### Primary (HIGH confidence)
- Chrome for Developers: `chrome.tabs.captureVisibleTab()` — https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab
- Chrome for Developers: `extensionTypes.ImageDetails` — https://developer.chrome.com/docs/extensions/reference/api/extensionTypes#type-ImageDetails (format: "jpeg"|"png", quality: number)
- Chrome for Developers: `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND = 2` — documented in tabs API constants
- MDN: Canvas `drawImage()` — standard Web API for image cropping
- MDN: `window.devicePixelRatio` — standard Web API

### Secondary (MEDIUM confidence)
- Stack Overflow #78771475 — captureVisibleTab side panel permission issues, verified against Chromium bug tracker
- Stack Overflow #32013884 — devicePixelRatio scaling for captureVisibleTab crops, verified with multiple implementations
- TarkaLabs Medium article — complete working example of captureVisibleTab + canvas crop with DPR scaling
- Chromium issue #40916430 — activeTab permission bug in side panel context

### Tertiary (LOW confidence)
- None — all claims verified or cited

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — uses only built-in browser APIs already verified in project stack research
- Architecture: HIGH — captureVisibleTab + canvas crop is the documented standard pattern; side panel calling convention verified
- Pitfalls: HIGH — DPR scaling, rate limiting, and permission issues are well-documented with multiple sources
- Computed styles subset: MEDIUM — curated list based on common CSS inspection needs; may need tuning after testing with Claude Code

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable browser APIs, unlikely to change)
