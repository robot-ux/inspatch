# Phase 4: React Fiber Detection & Source Map Resolution - Research

**Researched:** 2026-04-14
**Domain:** React Fiber internals, Chrome extension main-world injection, Source Map parsing
**Confidence:** HIGH

## Summary

This phase traces selected DOM elements back to their React component name and original source file location. The implementation requires three interconnected systems: (1) a main-world script that accesses React fiber tree data from DOM elements, (2) cross-world messaging between the injected script and the content script, and (3) source map resolution to map generated code positions back to original source files.

**Critical finding:** React 19 removed `_debugSource` from fiber nodes (PR #28265, merged March 2024). Since the project targets React 19.0.4, the original plan to use `fiber._debugSource` as the primary source location mechanism will not work. Source map resolution via `source-map-js` must be the **primary** mechanism for all React versions, with `_debugSource` as a bonus path for React 17/18 apps only. Component **names** are still available via `fiber.type.name`/`fiber.type.displayName` in React 19 dev builds — only source location metadata was removed.

**Primary recommendation:** Use WXT's `injectScript` + unlisted script pattern for main-world fiber access. Use `source-map-js` for source map resolution as the primary source location strategy. Treat `_debugSource` as an optional fast-path for React 17/18 only.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use `__REACT_FIBER_KEY` pattern — iterate DOM element keys to find the one matching `__reactFiber$` or `__reactInternalInstance$` prefix
- **D-02:** Main-world script injection via `chrome.scripting.executeScript({ world: 'MAIN' })` to access React internals
- **D-03:** Walk the fiber tree upward to find the nearest function component. Extract `fiber.type.name` or `fiber.type.displayName`
- **D-04:** Build parent component chain by continuing to walk up the fiber tree
- **D-05:** Use `fiber._debugSource` for React dev mode source info — **AMENDED: only works for React 17/18; React 19 removed this property**
- **D-06:** Fallback: fetch bundled JS file URL, parse inline/external source map to resolve original file paths — **PROMOTED: this must be the PRIMARY mechanism**
- **D-07:** Use `source-map-js` package for source map parsing
- **D-08:** Resolution should work for Vite, Next.js, and CRA dev servers
- **D-09:** Main-world script sends fiber data back to content script via `window.postMessage` with `__inspatch` source identifier
- **D-10:** Data passed between worlds must be JSON-serializable (componentName, parentChain, sourceFile, sourceLine)
- **D-11:** Sidebar element info card shows: component name, parent chain breadcrumb, source file path, source line number
- **D-12:** Graceful degradation when fiber detection fails

### Claude's Discretion
- Exact fiber key detection logic and edge case handling
- Source map fetch caching strategy
- UI layout for component chain display
- Error message wording for degraded mode

### Deferred Ideas (OUT OF SCOPE)
- Full React component tree visualization (v2 EDET-02)
- Vue/Svelte/Angular support (v2 MFRM-*)
- Tailwind class extraction (v2 EDET-01)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SRC-01 | Extension resolves selected element's position to source file path and line number via Source Map parsing | Source map resolution architecture — `source-map-js` with inline/external map support across bundlers |
| SRC-02 | Extension traverses React fiber tree to extract component name and parent component chain | Fiber traversal algorithm with tag-based type detection for function/class/memo/forwardRef/lazy components |
| SRC-03 | Source Map resolution works across Vite, Next.js, and Create React App dev servers | Bundler-specific source map format research — inline base64 (Vite), external .map with webpack:// (Next.js/CRA) |
| SRC-04 | Main-world script injection handles React fiber access across Chrome's isolated world boundary | WXT `injectScript` + unlisted script pattern with CustomEvent communication |
| SIDE-01 | Extension sidebar displays selected element info (component name, file path, line number, computed styles) | Sidebar integration via existing `ElementSelectionSchema` optional fields |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| source-map-js | 1.2.1 | Source map parsing | Synchronous API, no WASM, browser-compatible. 82M weekly downloads. Used by PostCSS, Sass. Project CLAUDE.md specifies this library. [VERIFIED: npm registry] |
| WXT injectScript | (built-in) | Main-world script injection | WXT's recommended approach for main-world access. Cross-browser, handles MV2/MV3, returns promise when script is evaluated. [VERIFIED: WXT docs] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @jridgewell/trace-mapping | 0.3.31 | Alternative source map parser | Modern successor to source-map with better memory (20x less than mozilla/source-map). Consider if source-map-js proves too slow for large maps. Not recommended as first choice since project already committed to source-map-js. [VERIFIED: npm registry] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| source-map-js | @jridgewell/trace-mapping | Trace-mapping is more modern with better memory usage, but source-map-js is explicitly chosen in project CLAUDE.md and has a simpler synchronous API |
| source-map-js | mozilla/source-map v0.7+ | Requires async WASM init, heavier for extension context. Explicitly listed in project's "What NOT to Use" |
| WXT injectScript | chrome.scripting.executeScript({ world: 'MAIN' }) | Direct API works but Chromium-only, no MV2 support, and loses the parent content script for extension API access. WXT approach is more robust |
| window.postMessage | CustomEvent on script element | WXT docs recommend CustomEvent on the script element for bidirectional communication. More targeted than global postMessage |

**Installation:**
```bash
cd packages/extension && bun add source-map-js
```

**Version verification:**
- source-map-js: 1.2.1 [VERIFIED: `npm view source-map-js version` → 1.2.1]
- @jridgewell/trace-mapping: 0.3.31 [VERIFIED: `npm view @jridgewell/trace-mapping version` → 0.3.31]

## Architecture Patterns

### Recommended Project Structure
```
packages/extension/entrypoints/
├── content.ts                       # Existing — add fiber bridge orchestration
├── content/
│   ├── element-detector.ts          # Existing — getElementAtPoint, getXPath
│   ├── inspect-mode.ts              # Existing — onSelect callback
│   ├── messaging.ts                 # Existing — sendElementSelection (enrich with fiber data)
│   ├── fiber-bridge.ts              # NEW — inject main-world script, listen for results
│   └── source-resolver.ts           # NEW — fetch/parse source maps, resolve positions
├── fiber-main-world.ts              # NEW — unlisted script, runs in page context
├── background.ts                    # Existing
└── sidepanel/
    └── App.tsx                      # Existing — add component info display
```

### Pattern 1: WXT Unlisted Script + injectScript for Fiber Access
**What:** Create a WXT unlisted script (`fiber-main-world.ts`) that runs in the page's main world. Inject it from the content script using WXT's `injectScript()` utility. Communicate via CustomEvent on the script element.
**When to use:** Whenever the content script needs data from the page's JavaScript context (React fiber tree, page globals).

**Content script side (fiber-bridge.ts):**
```typescript
// Source: WXT docs — https://wxt.dev/guide/essentials/content-scripts.html
import { injectScript } from 'wxt/utils/inject-script';

let injectedScript: HTMLScriptElement | null = null;

export async function initFiberBridge(): Promise<void> {
  const { script } = await injectScript('/fiber-main-world.js', {
    keepInDom: true,
    modifyScript(script) {
      script.addEventListener('inspatch-fiber-result', ((e: CustomEvent) => {
        handleFiberResult(e.detail);
      }) as EventListener);
    },
  });
  injectedScript = script;
}

export function queryFiber(selector: string): void {
  injectedScript?.dispatchEvent(
    new CustomEvent('inspatch-fiber-query', {
      detail: { selector },
    })
  );
}
```

**Main-world script (fiber-main-world.ts):**
```typescript
export default defineUnlistedScript(() => {
  const script = document.currentScript;

  script?.addEventListener('inspatch-fiber-query', ((e: CustomEvent) => {
    const { selector } = e.detail;
    const result = extractFiberData(selector);
    script.dispatchEvent(
      new CustomEvent('inspatch-fiber-result', { detail: result })
    );
  }) as EventListener);
});
```

### Pattern 2: Fiber Tree Traversal Algorithm
**What:** Walk from DOM element → fiber node → nearest user component, collecting component names.
**When to use:** Every time a DOM element is selected.

```typescript
// Runs in main-world script context
function extractFiberData(selector: string) {
  const el = document.querySelector(selector);
  if (!el) return { componentName: null, parentChain: [], debugSource: null };

  const fiberKey = Object.keys(el).find(
    k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
  );
  if (!fiberKey) return { componentName: null, parentChain: [], debugSource: null };

  const fiber = (el as any)[fiberKey];
  return walkFiberTree(fiber);
}

function walkFiberTree(startFiber: any) {
  const parentChain: string[] = [];
  let componentName: string | null = null;
  let debugSource: { fileName: string; lineNumber: number } | null = null;
  let fiber = startFiber;

  while (fiber) {
    const name = getComponentName(fiber);
    if (name) {
      if (!componentName) {
        componentName = name;
        // React 17/18 only — null in React 19
        debugSource = fiber._debugSource ?? null;
      }
      parentChain.push(name);
    }
    fiber = fiber.return;
  }

  return { componentName, parentChain, debugSource };
}

function getComponentName(fiber: any): string | null {
  const type = fiber.type;
  if (!type) return null;

  if (typeof type === 'string') return null; // Host element (div, span)
  if (typeof type === 'function') {
    return type.displayName || type.name || null;
  }
  // Handle forwardRef: { $$typeof: Symbol(react.forward_ref), render: fn }
  if (type.$$typeof) {
    const symbol = type.$$typeof.toString();
    if (symbol.includes('forward_ref')) {
      return type.displayName || type.render?.displayName || type.render?.name || null;
    }
    if (symbol.includes('memo')) {
      return type.displayName || getComponentName({ type: type.type }) || null;
    }
  }
  return null;
}
```

### Pattern 3: Source Map Resolution Chain
**What:** Fetch generated JS files, extract sourceMappingURL, parse source maps, resolve positions.
**When to use:** After fiber traversal, to resolve original source file paths for the selected element.

```typescript
// Runs in content script context (has fetch access to page origin)
import { SourceMapConsumer } from 'source-map-js';

const sourceMapCache = new Map<string, SourceMapConsumer>();

async function resolveSourceLocation(
  scriptUrl: string,
  line: number,
  column: number
): Promise<{ source: string; line: number; column: number } | null> {
  const consumer = await getOrFetchSourceMap(scriptUrl);
  if (!consumer) return null;

  const pos = consumer.originalPositionFor({ line, column });
  if (!pos.source) return null;

  return { source: pos.source, line: pos.line!, column: pos.column! };
}

async function getOrFetchSourceMap(url: string): Promise<SourceMapConsumer | null> {
  if (sourceMapCache.has(url)) return sourceMapCache.get(url)!;

  const response = await fetch(url);
  const text = await response.text();

  // Handle both inline and external source maps
  const inlineMatch = text.match(
    /\/\/[#@]\s*sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,(.+)$/m
  );
  const externalMatch = text.match(
    /\/\/[#@]\s*sourceMappingURL=(.+\.map.*)$/m
  );

  let rawMap: any;
  if (inlineMatch) {
    rawMap = JSON.parse(atob(inlineMatch[1]));
  } else if (externalMatch) {
    const mapUrl = new URL(externalMatch[1], url).href;
    const mapResponse = await fetch(mapUrl);
    rawMap = await mapResponse.json();
  } else {
    return null;
  }

  const consumer = new SourceMapConsumer(rawMap);
  sourceMapCache.set(url, consumer);
  return consumer;
}
```

### Anti-Patterns to Avoid
- **Accessing `__reactFiber$` from content script:** Content scripts run in isolated world. Fiber keys exist only in the page's main world. MUST inject a main-world script.
- **Relying on `_debugSource` for React 19:** Removed in React 19 (PR #28265). Source map resolution is the only reliable path for source locations.
- **Using `window.postMessage` for cross-world communication:** Works but global — any page script can intercept/forge. Use WXT's `CustomEvent` on the script element instead (more targeted).
- **Parsing source maps synchronously on hover:** Source maps can be 5MB+. Fetch and parse lazily on first access per script URL, cache the consumer.
- **Full fiber traversal on every mouse event:** Cache component-to-element mappings. Only re-traverse when selection changes, not on every hover.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Source map VLQ decoding | Custom base64/VLQ decoder | `source-map-js` SourceMapConsumer | VLQ uses delta encoding — a single error cascades silently through all subsequent mappings (CP-4). Battle-tested library handles edge cases |
| Cross-world messaging protocol | Custom postMessage wrapper with source filtering | WXT `injectScript` + CustomEvent pattern | WXT handles MV2/MV3 differences, script loading timing, and provides a clean bidirectional API via the script element |
| React component name extraction from different fiber types | Simple `fiber.type.name` check | Algorithm that handles function/class/forwardRef/memo/lazy types | React uses different wrapper structures ($$typeof symbols). A naive check misses ~30% of real-world components |
| Source map URL resolution (relative → absolute) | Manual string concatenation | `new URL(mapUrl, scriptUrl).href` | Relative URLs can use `../`, protocol-relative `//`, or absolute paths. URL constructor handles all cases correctly |

**Key insight:** Source map parsing is deceptively complex. The VLQ encoding format means corruption cascades silently — you'll get wrong line numbers that look plausible but are completely incorrect. Always use a proven library.

## Common Pitfalls

### Pitfall 1: React 19 Removed _debugSource (CRITICAL)
**What goes wrong:** Extension tries to read `fiber._debugSource` and gets `undefined` for every component on React 19 apps. Source location feature appears completely broken.
**Why it happens:** React 19 (PR #28265, March 2024) removed `_debugSource` from fiber nodes. The old Babel JSX source transform that populated this field is no longer used.
**How to avoid:** Make source map resolution the PRIMARY mechanism. Check for `_debugSource` as an optional bonus (React 17/18 apps) but never depend on it. Test against React 19 apps first.
**Warning signs:** `fiber._debugSource` is always `null`/`undefined`; works on React 18 apps but not React 19.

### Pitfall 2: Source Map Format Varies by Bundler
**What goes wrong:** Source map parsing works for Vite but fails for Next.js/CRA, or vice versa.
**Why it happens:**
- **Vite dev mode:** Inline base64-encoded source maps (`//# sourceMappingURL=data:application/json;base64,...`) [VERIFIED: Vite source code]
- **Next.js dev mode:** External `.map` files with `webpack://` protocol URLs in sources array [VERIFIED: Next.js PR history]
- **CRA dev mode:** External `.map` files via webpack `eval-source-map` or `cheap-module-source-map`
**How to avoid:** Handle both inline (base64 data URL) and external (.map file) source maps. Resolve relative URLs using the script's actual URL as base. Normalize `webpack://` protocol paths.
**Warning signs:** 404 when fetching .map files; source map loads but `sources` array has unfamiliar URL schemes.

### Pitfall 3: Unlisted Script Not in web_accessible_resources
**What goes wrong:** `injectScript('/fiber-main-world.js')` silently fails or throws a CSP error. The script never loads, fiber detection returns nothing.
**Why it happens:** WXT does NOT automatically add unlisted scripts to `web_accessible_resources`. The developer must declare them manually in `wxt.config.ts`. [VERIFIED: WXT GitHub issue #536]
**How to avoid:** Add to `wxt.config.ts` manifest:
```typescript
web_accessible_resources: [{
  resources: ['fiber-main-world.js'],
  matches: ['http://localhost:*/*'],
}]
```
**Warning signs:** Extension works in development (WXT may be more permissive) but fails in production build.

### Pitfall 4: CustomEvent Communication Timing
**What goes wrong:** Content script sends a fiber query CustomEvent but the main-world script hasn't loaded yet. Query is lost silently.
**Why it happens:** `injectScript` returns when the script element is added to DOM, but execution may not have completed if the script is async.
**How to avoid:** Await `injectScript()` promise before dispatching events. Use `keepInDom: true` so the script element remains available for event communication. Add the event listener via `modifyScript` callback (fires before script loads).
**Warning signs:** Intermittent failures on page load; fiber queries return no results on first attempt but work on retry.

### Pitfall 5: Fiber Key Not Found on DOM Element
**What goes wrong:** `Object.keys(el).find(k => k.startsWith('__reactFiber$'))` returns undefined even though the page uses React.
**Why it happens:** Several causes: (1) the element is the React root container, not a rendered element, (2) React hasn't finished hydrating/rendering yet, (3) the page uses a production build where the property still exists but component names are minified, (4) the element is inside a portal or shadow DOM.
**How to avoid:** After finding no fiber key, walk UP the DOM tree checking ancestors. Many DOM elements (text nodes, fragments) don't have fiber keys but their parent does. Add a retry with short delay for hydration race conditions.
**Warning signs:** Works on some elements but not others; fails immediately after page load but works after user interaction.

### Pitfall 6: Source Map Fetching From Extension Context
**What goes wrong:** Fetching `.map` files from extension context fails with CORS or 404 errors.
**Why it happens:** Source map URLs are relative to the script's origin (localhost:5173). When fetched from the extension context, the base URL is different. Some dev servers only serve source maps to same-origin requests.
**How to avoid:** Fetch source maps from the **content script** which runs in the page's origin context and has same-origin access to the dev server. The manifest already has `host_permissions: ['http://localhost:*/*']`. [VERIFIED: existing wxt.config.ts]
**Warning signs:** 404 or CORS errors; maps load in Chrome DevTools but not from extension code.

## Code Examples

### WXT Unlisted Script Definition
```typescript
// Source: WXT docs — https://wxt.dev/guide/essentials/content-scripts.html
// entrypoints/fiber-main-world.ts
export default defineUnlistedScript(() => {
  const script = document.currentScript;

  script?.addEventListener('inspatch-fiber-query', ((e: CustomEvent) => {
    const { selector } = e.detail;
    const el = document.querySelector(selector);
    if (!el) {
      script.dispatchEvent(new CustomEvent('inspatch-fiber-result', {
        detail: { componentName: null, parentChain: [], debugSource: null },
      }));
      return;
    }

    const fiberKey = Object.keys(el).find(
      k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );

    if (!fiberKey) {
      // Walk up DOM to find nearest element with fiber key
      let ancestor = el.parentElement;
      while (ancestor) {
        const key = Object.keys(ancestor).find(
          k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
        );
        if (key) {
          const result = walkFiberTree((ancestor as any)[key]);
          script.dispatchEvent(new CustomEvent('inspatch-fiber-result', { detail: result }));
          return;
        }
        ancestor = ancestor.parentElement;
      }
      script.dispatchEvent(new CustomEvent('inspatch-fiber-result', {
        detail: { componentName: null, parentChain: [], debugSource: null },
      }));
      return;
    }

    const result = walkFiberTree((el as any)[fiberKey]);
    script.dispatchEvent(new CustomEvent('inspatch-fiber-result', { detail: result }));
  }) as EventListener);
});
```

### WXT Config for web_accessible_resources
```typescript
// Source: WXT docs + WXT GitHub issue #536
// wxt.config.ts addition
manifest: {
  // ... existing config ...
  web_accessible_resources: [
    {
      resources: ['fiber-main-world.js'],
      matches: ['http://localhost:*/*'],
    },
  ],
}
```

### source-map-js Inline Source Map Parsing
```typescript
// Source: npm package docs — https://www.npmjs.com/package/source-map-js
import { SourceMapConsumer } from 'source-map-js';

// Inline base64 source map (Vite dev mode default)
const inlineRegex = /\/\/[#@]\s*sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,(.+)$/m;

function parseInlineSourceMap(jsContent: string): SourceMapConsumer | null {
  const match = jsContent.match(inlineRegex);
  if (!match) return null;
  const rawMap = JSON.parse(atob(match[1]));
  return new SourceMapConsumer(rawMap);
}
```

### Element Selector for Cross-World Communication
```typescript
// Generate a unique CSS selector for cross-world element identification.
// XPath can't be used with document.querySelector in the main world.
function getUniqueSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)} > ${selector}`);
      break;
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        c => c.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(' > ');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `fiber._debugSource` for source location | Source map resolution at runtime | React 19 (Dec 2024) | `_debugSource` removed from fiber nodes; all click-to-source tools broken; source-map-based resolution is now the only universal approach [VERIFIED: React PR #28265, issues #29092, #32574] |
| `chrome.tabs.executeScript` for injection | `chrome.scripting.executeScript` with `world: 'MAIN'` | Chrome 102 (MV3) | New API supports world parameter; WXT's `injectScript` wraps this for cross-browser support [VERIFIED: Chrome docs] |
| `__reactInternalInstance$` for fiber access | `__reactFiber$` (React 16+) | React 16 (2017) | Both still work; check for both prefixes for compatibility [VERIFIED: StackOverflow, React internals] |
| mozilla/source-map WASM async API | source-map-js synchronous API | source-map-js v1.0 (2021) | Sync API avoids WASM init complexity in extension contexts [VERIFIED: npm registry, project CLAUDE.md decision] |

**Deprecated/outdated:**
- `_debugSource` on fiber nodes: Removed in React 19. Do not depend on it as primary mechanism.
- `ReactDOM.findDOMNode`: Removed in React 19. Not relevant to this phase but worth noting.
- `__self` and `__source` JSX transforms: Removed alongside `_debugSource` in React 19 (PR #28265).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | CRA dev mode uses webpack source maps with `eval-source-map` or `cheap-module-source-map` devtool | Common Pitfalls - Pitfall 2 | Source map extraction logic may need different regex or fetch approach for CRA. Medium risk — CRA is the least common target. [ASSUMED] |
| A2 | `injectScript` promise resolution guarantees script has been evaluated (not just DOM-inserted) in MV3 | Architecture Patterns - Pattern 1 | If script isn't evaluated yet, CustomEvent queries will be lost. Can mitigate with a ready handshake. [ASSUMED] |
| A3 | `source-map-js` handles `webpack://` protocol URLs in source maps correctly | Architecture Patterns - Pattern 3 | If not, may need to strip/normalize webpack:// prefix before displaying paths. Low risk — standard source map consumer behavior. [ASSUMED] |
| A4 | Vite always uses inline base64 source maps in dev mode (never external .map files) | Common Pitfalls - Pitfall 2 | If Vite serves external maps in some configurations, the inline-only regex would miss them. Both paths are implemented so risk is low. [ASSUMED] |
| A5 | React 19 dev builds still attach `__reactFiber$` keys to DOM elements | Architecture Patterns - Pattern 2 | If removed, the entire fiber access strategy fails. Very low risk — confirmed still present. [VERIFIED: React internals article, StackOverflow 2025] |

## Open Questions

1. **How does source map resolution work without `_debugSource` line/column info?**
   - What we know: React 19 removed `_debugSource`. Fiber nodes still have a `_debugStack` property containing an Error stack trace, but parsing it requires resolving through source maps.
   - What's unclear: Whether we should parse `_debugStack` or use an entirely different approach (e.g., map DOM element position to generated code position via the element's script tag).
   - Recommendation: For v1, use the DOM element's owning script URL + text content search as a heuristic to find the generated position, then resolve via source map. The `_debugStack` approach (used by `show-component` library) is more accurate but significantly more complex. Start simple, iterate if needed.

2. **How to determine which script file "owns" a DOM element for source map lookup?**
   - What we know: We need a script URL + line/column to feed into source map resolution. React doesn't directly tell us which bundle file rendered a given element.
   - What's unclear: The best heuristic for mapping DOM element → bundle script URL.
   - Recommendation: Use `document.scripts` to enumerate page scripts, look for the one with the matching source map. For React 19, combine fiber component name with source map `sources` list to find the right file. For React 17/18, `_debugSource.fileName` gives us the answer directly.

3. **Should we support React 17, 18, AND 19 or just 19?**
   - What we know: React 19 is current (Dec 2024), but many apps still use 18. The fiber key pattern works for all versions. `_debugSource` works for 17/18 only.
   - What's unclear: User expectations for version support.
   - Recommendation: Support all three. Check `_debugSource` first (fast path for 17/18), fall back to source map resolution (works for all). Detect React version at runtime via `__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| source-map-js | Source map parsing | Not yet installed | 1.2.1 (npm) | — (must install) |
| WXT injectScript | Main-world injection | Built into WXT | 0.20.20 | — |
| Chrome scripting API | Script injection permission | Yes (manifest) | MV3 | — |
| Chrome activeTab | Tab access for script injection | Yes (manifest) | MV3 | — |

**Missing dependencies with no fallback:**
- `source-map-js` must be installed in the extension package

**Missing dependencies with fallback:**
- None

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Yes | Validate all data received via CustomEvent from main-world script. Never trust fiber data — it comes from the page context (fully untrusted). |
| V6 Cryptography | No | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious page forges CustomEvent with fake fiber data | Tampering | Use unique event names (`inspatch-fiber-*`), validate data structure with Zod schema before trusting it. Don't expose sensitive extension data via events. |
| Source map URLs could point to non-localhost origins | Information Disclosure | Only fetch source maps from `http://localhost:*` origins. Validate URL before fetching. The `host_permissions` already restrict to localhost. |
| File paths in source maps could reveal system information | Information Disclosure | Sanitize displayed paths to project-relative format before showing in sidebar. Never send absolute paths over postMessage. |

## Sources

### Primary (HIGH confidence)
- React PR #28265 — Removal of `_debugSource` and `__self`/`__source`: https://github.com/facebook/react/pull/28265 [VERIFIED]
- React Issue #32574 — Community request to bring back `_debugSource`: https://github.com/facebook/react/issues/32574 [VERIFIED]
- React Issue #29092 — Fiber missing debug information in React 19: https://github.com/facebook/react/issues/29092 [VERIFIED]
- React PR #28351 — DevTools lazy source definition via component stacks: https://github.com/facebook/react/pull/28351 [VERIFIED]
- WXT Content Scripts docs — Main world injection, injectScript, CustomEvent: https://wxt.dev/guide/essentials/content-scripts.html [VERIFIED]
- WXT GitHub Issue #536 — web_accessible_resources requirement for unlisted scripts: https://github.com/wxt-dev/wxt/issues/536 [VERIFIED]
- source-map-js npm package — Synchronous API, SourceMapConsumer: https://www.npmjs.com/package/source-map-js [VERIFIED]
- Chrome scripting API — executeScript with world: 'MAIN': https://developer.chrome.com/docs/extensions/reference/api/scripting [VERIFIED]
- Vite source map handling — genSourceMapUrl inline base64: https://github.com/vitejs/vite/blob/main/packages/vite/src/node/server/sourcemap.ts [VERIFIED]

### Secondary (MEDIUM confidence)
- React DevTools getComponentNameFromFiber — Component name extraction patterns: https://github.com/facebook/react/pull/20940 [CITED]
- Next.js source map PR history — webpack:// protocol handling: https://github.com/vercel/next.js/pull/75863 [CITED]
- show-component library — _debugStack + source map approach for React 19: https://github.com/sidorares/show-component [CITED]
- StackOverflow — __reactFiber$ access in React 19: https://stackoverflow.com/questions/78137532 [CITED]
- React fiber type detection — forwardRef/memo displayName handling: https://github.com/facebook/react/pull/29625 [CITED]

### Tertiary (LOW confidence)
- CRA source map format details — assumed based on webpack defaults [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — source-map-js verified on npm, WXT injectScript verified in docs
- Architecture: HIGH — WXT injection pattern well-documented, fiber access pattern confirmed working in React 19
- React 19 _debugSource removal: HIGH — directly verified via React PRs and issues
- Pitfalls: HIGH — verified via React issues, WXT issues, and project PITFALLS.md
- Source map format per bundler: MEDIUM — Vite verified from source, Next.js verified from PRs, CRA assumed

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (30 days — React internals are stable between major versions)
