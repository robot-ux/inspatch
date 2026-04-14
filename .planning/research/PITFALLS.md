# Pitfalls Research

**Domain:** Chrome Extension Visual Code Editing Tool
**Researched:** 2026-04-13
**Confidence:** HIGH (multi-source verified for Chrome extension and React fiber topics; MEDIUM for Claude Code CLI integration due to rapid evolution)

---

## Critical Pitfalls

### CP-1: Service Worker Termination Kills WebSocket Mid-Operation

**What goes wrong:** The MV3 service worker terminates after 30 seconds of inactivity or 5 minutes of continuous execution. If the service worker is the WebSocket owner, the connection drops silently mid-AI-operation — the user submits a change, Claude Code starts processing, and the extension loses its communication channel before the result returns.

**Why it happens:** MV3 service workers are ephemeral by design. Chrome kills them aggressively. WebSocket connections, in-memory state, and timers all vanish on termination. Unlike MV2 background pages, there is no opt-out.

**How to avoid:**
- Do NOT hold WebSocket connections in the service worker. Own the WebSocket from the **side panel** or **offscreen document** instead — these have longer lifetimes while visible.
- If the service worker must hold the socket, implement a 20-second keepalive ping (Chrome 116+ treats WebSocket activity as "active").
- Persist all in-flight operation state to `chrome.storage.session` so operations can resume after restart.
- Use `chrome.alarms` (minimum 1-minute interval) as a fallback wakeup mechanism.

**Warning signs:** Intermittent "connection lost" errors during AI processing; operations that succeed for short prompts but fail for long ones; state disappearing between user actions.

**Phase to address:** Core extension architecture (Phase 1-2). Must be a foundational architectural decision, not a retrofit.

---

### CP-2: Content Script Cannot Access React Fiber Tree (World Isolation)

**What goes wrong:** Content scripts run in an isolated JavaScript world. `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`, `__REACT_FIBER_SECRET_INTERNALS`, and all React runtime objects are invisible from the content script's execution context. The extension can see the DOM but cannot traverse the component tree.

**Why it happens:** Chrome's isolated world security model prevents content scripts from accessing page-level JavaScript variables. This is intentional and cannot be bypassed from the isolated world.

**How to avoid:**
- Inject a **main-world script** using `chrome.scripting.registerContentScripts({ world: "MAIN" })` (Chrome 102+). This script runs in the page's context and CAN access React internals.
- Bridge data back to the content script via `window.postMessage()` or `CustomEvent` dispatching — the main-world script reads fiber data and posts it to the content script.
- Never attempt to access `__REACT_DEVTOOLS_GLOBAL_HOOK__` directly from a content script — it will always be undefined.

**Warning signs:** `undefined` when accessing any window-level page variables; fiber traversal code works in console but not in extension.

**Phase to address:** Element-to-source mapping phase. This is the core technical mechanism.

---

### CP-3: Source Maps Not Accessible or Fetched Incorrectly from Extension Context

**What goes wrong:** The extension tries to fetch `.map` files from the dev server but fails due to CORS, CSP, or Chrome's extension fetch restrictions. Source maps may reference `//# sourceMappingURL` as relative paths that resolve differently from the extension context vs. the page context.

**Why it happens:** Source map URLs are relative to the script that references them. When fetched from an extension context, the base URL changes. Additionally, some dev servers serve source maps only to same-origin requests, and Chrome's extension CSP may block fetches to localhost depending on permission configuration.

**How to avoid:**
- Fetch source maps from the **content script** (which runs in the page's origin context) or from the **local middleware server** (which has direct filesystem access to `.map` files).
- Parse `//# sourceMappingURL` from script tags, resolve URLs relative to the script's actual URL, not the extension URL.
- Handle both inline source maps (`data:application/json;base64,...`) and external `.map` files.
- Add `host_permissions` for `http://localhost:*/*` in the manifest to enable fetching from any local dev server port.

**Warning signs:** 404 or CORS errors when fetching `.map` files; source maps load in DevTools but not from extension code; works on port 3000 but not port 5173.

**Phase to address:** Source map resolution phase. Validate across Vite, Next.js, and CRA dev servers.

---

### CP-4: VLQ Decoding Corruption Cascades Silently

**What goes wrong:** Source map mappings use delta-encoded VLQ (Variable-Length Quantity). If a source map is truncated, corrupted, or partially loaded, the decoder doesn't error — it produces **wildly incorrect line numbers** for every mapping after the corruption point. The extension points users to wrong files and lines.

**Why it happens:** VLQ uses relative offsets. Each segment's position is relative to the previous. A single corrupted segment causes all subsequent segments to accumulate the error. Unlike absolute offsets, there's no self-correcting mechanism.

**How to avoid:**
- Use `mozilla/source-map` library (battle-tested, WASM-accelerated) rather than hand-rolling VLQ decoding.
- Validate parsed positions: if `originalPositionFor()` returns a line number beyond the file's actual line count, flag it as suspect.
- Cross-validate by checking that the returned filename exists and the line content is plausible.
- Implement a "confidence score" for mappings — present low-confidence results with a warning rather than silently acting on them.

**Warning signs:** Mapped line numbers pointing past EOF; element clicking opens correct file but wrong line; results seem "close but off by many lines."

**Phase to address:** Source map parsing phase. Build validation into the core mapping pipeline.

---

### CP-5: Element Overlay Blocks Page Interaction and Misdetects Targets

**What goes wrong:** The highlight overlay (positioned div over hovered elements) intercepts mouse events. `document.elementFromPoint()` returns the overlay element instead of the actual page element. Click events don't reach the underlying page. Users can't interact with the page at all while selection mode is active.

**Why it happens:** The overlay sits in the DOM above the page content. Without `pointer-events: none`, it captures all mouse events. But with `pointer-events: none`, it can't detect clicks for selection. This is the fundamental tension of in-page selection tools.

**How to avoid:**
- Use `pointer-events: none` on the overlay, and use `document.elementFromPoint(x, y)` from a mousemove listener on the document (which receives events because the overlay passes them through).
- Temporarily remove the overlay element before calling `elementFromPoint()`, then restore it.
- Use Shadow DOM for overlay elements to prevent CSS conflicts with the page.
- Study VisBug's architecture: it uses custom elements with Shadow DOM for selection overlays, intercepting interactions at the document level and rendering feedback elements on top.

**Warning signs:** Hover highlight works but click selects the overlay; page becomes unclickable in selection mode; CSS from the page leaks into highlight styling.

**Phase to address:** Element selection/highlighting phase. This is a core UX mechanism.

---

### CP-6: Side Panel `open()` Fails Outside User Gesture Context

**What goes wrong:** `chrome.sidePanel.open()` throws "may only be called in response to a user gesture" even when seemingly called from a click handler. The gesture context is lost after ~1ms (much shorter than other Chrome APIs). Any async operation, `await`, or message round-trip between the click and the `open()` call loses the gesture.

**Why it happens:** Chrome's gesture tracking for `sidePanel.open()` has an extremely short validity window — approximately 1 millisecond. Using `await` or chaining through `chrome.runtime.sendMessage` introduces enough delay to lose the gesture.

**How to avoid:**
- Call `sidePanel.open()` **synchronously** in the callback chain from the user action.
- Pre-cache `tabId` in the service worker via `chrome.tabs.onActivated` so you don't need async lookups at open time.
- Use `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` as the primary open mechanism — this bypasses the gesture requirement entirely.
- Never `await` anything between the user click and the `open()` call.

**Warning signs:** Panel opens from browser action but not from context menu or keyboard shortcut; intermittent "user gesture" errors in console.

**Phase to address:** Extension scaffolding/UI phase.

---

### CP-7: Production React Builds Strip Component Names and Debug Info

**What goes wrong:** In production builds, React component names are minified to single letters (`a`, `t`, `n`). The `_debugSource` property on fiber nodes is stripped. The extension shows meaningless names and cannot map components to source files using fiber metadata alone.

**Why it happens:** Production bundlers (Terser, SWC, esbuild) minify function/class names for bundle size. React itself strips debug properties in production mode for performance.

**How to avoid:**
- **Primary target is dev mode** (local dev servers) where names and debug info are preserved. Document this as a requirement.
- For production builds, fall back to source map-based resolution (DOM element → generated code position → original source via source map) rather than relying on fiber metadata.
- Detect React's build mode via `process.env.NODE_ENV` exposure or checking if `__REACT_DEVTOOLS_GLOBAL_HOOK__` has populated renderers.
- Consider using the `displayName` convention detection as a secondary signal.

**Warning signs:** Component names show as single characters; `_debugSource` is `null` or `undefined`; fiber tree structure exists but metadata is empty.

**Phase to address:** Element-to-source mapping phase. Design dual-path resolution (dev vs. prod).

---

## Technical Debt Patterns

| Pattern | How It Accumulates | Prevention | Phase |
|---------|--------------------|------------|-------|
| Hardcoded port numbers | Extension assumes `localhost:3000`, then `5173`, then `8080` — each added as a special case | Configurable port discovery from the start; detect dev server via `host_permissions` on `localhost:*` | Extension setup |
| Bundler-specific source map hacks | "Fix" for Vite source maps breaks webpack; CRA workaround conflicts with Next.js | Abstract source map resolution behind a strategy pattern; test against all target bundlers | Source map parsing |
| Synchronous fiber traversal | Works for small apps, blocks main thread on 500+ component trees; gets worse as features add more traversal | Use async chunked traversal from the start; yield to the event loop every N nodes | Element-to-source mapping |
| Message type sprawl | `postMessage` types grow organically; no schema validation; silent failures on unknown types | Define a message protocol schema early; validate incoming messages; version the protocol | Extension architecture |
| Inline string prompts | Claude Code prompts hardcoded in JS; changing prompt format requires code deploy | Store prompt templates externally; make them configurable without code changes | CLI integration |

---

## Integration Gotchas

| Integration Point | Gotcha | Impact | Mitigation |
|--------------------|--------|--------|------------|
| Content script ↔ Main-world script | `postMessage` is global — any page JS or other extension can read/forge messages | Data leakage; malicious pages could inject fake fiber data | Use a unique, randomized message source key per session; validate structure and origin |
| Extension ↔ Side panel | Side panel is a separate document — no direct variable sharing with content script | State sync bugs; stale UI | Route all state through `chrome.runtime.sendMessage` or `chrome.storage.session` with change listeners |
| Side panel ↔ Service worker | Service worker may restart between messages; pending responses are lost | Lost operation results; hung UI states | Implement request IDs with timeout/retry; persist in-flight requests to `chrome.storage.session` |
| Extension ↔ Local server (WebSocket) | `ws://localhost` mixed content is blocked on `https://` pages | Extension fails on HTTPS dev servers (Next.js default) | Use `wss://` with self-signed cert, or fetch via service worker which isn't subject to mixed content restrictions |
| Local server ↔ Claude Code CLI | CLI process may hang, crash, or produce non-JSON output unexpectedly | Server blocks waiting for CLI response; memory leaks from zombie processes | Set execution timeouts (60-120s); kill process on timeout; validate output format before parsing |
| Source map fetch ↔ Dev server | Dev server may lag or restart during HMR; source maps temporarily 404 | Stale mappings; "file not found" errors mid-session | Retry with backoff; cache last-known-good source maps; detect HMR events and refresh |

---

## Performance Traps

| Trap | Symptom | Root Cause | Fix |
|------|---------|------------|-----|
| Large source map parsing on main thread | Page freezes on hover when first resolving element location | `mozilla/source-map` synchronous parsing of 5MB+ source maps | Use the WASM-accelerated async API; parse lazily on first access; cache parsed consumers |
| Fiber tree full traversal on every hover | Visible jank (>16ms frame budget blown) on mousemove | Walking 1000+ fiber nodes synchronously per mouse event | Cache component-to-element mappings; only re-traverse on React render events, not mouse events |
| Screenshot capture blocking UI | Visible flash/freeze during `html2canvas` or `chrome.tabs.captureVisibleTab` | Synchronous DOM serialization or tab capture API latency | Use `chrome.tabs.captureVisibleTab` (fastest); crop client-side; never use `html2canvas` in content scripts |
| WebSocket message flooding | Lag spikes when rapidly hovering elements | Each mousemove sends a WebSocket message to the server | Debounce/throttle hover events (100-200ms); batch messages; only send on element change, not position change |
| Unbounded `chrome.storage` writes | Extension slows down over long sessions | Writing full state on every interaction without cleanup | Write only diffs; implement session cleanup; use `chrome.storage.session` (cleared on browser close) |

---

## Security Mistakes

| Mistake | Risk | Mitigation |
|---------|------|------------|
| Broadcasting page data via `postMessage` without origin check | Any page JavaScript can intercept element data, file paths, and source code snippets sent between content script and main-world script | Use unique message channel IDs; validate `event.source === window` and check custom source keys |
| Exposing local file paths in extension UI | Source map resolution reveals full filesystem paths (`/Users/dev/project/src/App.tsx`); if extension UI is injectable, paths leak | Sanitize paths to project-relative in the UI; never send absolute paths through `postMessage` |
| WebSocket without authentication | Any local process can connect to the WebSocket server and issue Claude Code commands | Generate a session token on server start; require it in the WebSocket handshake; bind to `127.0.0.1` only |
| Claude Code CLI injection via prompt | User input is interpolated into CLI prompts without sanitization; crafted input could escape the prompt and execute arbitrary commands | Escape/sanitize user input in prompt templates; use `--allowedTools` to restrict Claude Code's capabilities; never use shell interpolation for prompt content |
| `<all_urls>` permission for convenience | Triggers maximum Chrome Web Store review scrutiny; unnecessary for localhost-only tool | Use `host_permissions: ["http://localhost:*/*", "http://127.0.0.1:*/*"]` — minimal and accurate |

---

## UX Pitfalls

| Pitfall | User Experience Impact | Fix |
|---------|----------------------|-----|
| Selection mode blocks all page interaction | User can't scroll, click links, or interact with the page while selecting — feels like a freeze | Provide a clear toggle (keyboard shortcut like `Esc` to exit); allow scroll-through; only capture click, not all events |
| Overlay highlight flickers on rapid mouse movement | Distracting visual noise; feels broken | Debounce overlay updates (50ms minimum); use CSS transitions for smooth appearance/disappearance; batch DOM updates with `requestAnimationFrame` |
| Popup/panel positioned offscreen | Inline change input appears below the viewport or behind the element | Calculate viewport bounds before positioning; flip direction when near edges; use the side panel instead of inline popups for primary input |
| No feedback during Claude Code processing | User submits change, nothing happens for 10-30 seconds, assumes it's broken | Show streaming status: "Analyzing code…", "Making changes…", "Waiting for hot reload…"; use Claude Code's `stream-json` output format for real-time progress |
| Change applied but page doesn't hot-reload | File is modified but dev server doesn't detect the change or HMR fails silently | Detect common HMR failure patterns; show "Change applied to `src/App.tsx:42` — if you don't see updates, check your dev server console"; implement a manual refresh fallback |
| Element re-identification fails after DOM update | After hot-reload, the selected element is gone (different DOM node); extension loses context | Store multiple identification signals (CSS selector path, text content, bounding box); re-find the "same" element after DOM mutations using fuzzy matching |
| Stale source map after code change | User edits via Inspatch, source maps update, but extension still uses cached maps — next selection points to old positions | Invalidate source map cache on any file change notification from dev server; use dev server's HMR WebSocket events as cache-bust triggers |

---

## "Looks Done But Isn't" Checklist

- [ ] **"Element selection works"** — but only for static elements. Dynamic content (modals, tooltips, dropdown menus) disappears when clicked because the click handler triggers page logic AND selection simultaneously.
- [ ] **"Source map resolution works"** — but only for Vite. Next.js uses a different source map structure (`webpack://` protocol URLs) and CRA's `cheap-module-source-map` lacks column-level accuracy.
- [ ] **"React component detection works"** — but only for function components. Class components, `React.memo()` wrappers, `React.forwardRef()`, and HOCs all produce different fiber structures that need explicit handling.
- [ ] **"WebSocket connection works"** — but only when the service worker is alive. Connection drops silently after 30 seconds of idle. The reconnection logic doesn't replay in-flight messages.
- [ ] **"Claude Code integration works"** — but only for simple changes. Multi-file changes, changes requiring new imports, or changes in CSS modules produce partial results because the prompt lacks sufficient context.
- [ ] **"Works on localhost:3000"** — but not on `localhost:5173` (Vite default), `localhost:8080`, or `0.0.0.0:3000` (Docker). Host permission covers `localhost` but not `0.0.0.0` or `127.0.0.1` mapped differently.
- [ ] **"Side panel shows element info"** — but loses state when switching tabs and back. The panel document reloads or the service worker drops the cached element data.
- [ ] **"Overlay highlighting works"** — but breaks on pages using CSS `transform`, `position: fixed` containers, or `overflow: hidden` ancestors. Calculated positions don't account for stacking contexts.
- [ ] **"Works with React 18"** — but fiber tree structure changed between React 17 and 18, and React 19 (Server Components) introduces a fundamentally different rendering model with partial hydration.
- [ ] **"Screenshot capture works"** — but `chrome.tabs.captureVisibleTab` captures the entire viewport, not just the element. Cropping logic fails for elements partially offscreen or inside scrollable containers.

---

## Recovery Strategies

| Failure Scenario | Detection | Recovery |
|------------------|-----------|----------|
| WebSocket connection lost mid-operation | `onclose` event; pending request timeout | Auto-reconnect with exponential backoff (1s → 2s → 4s → 8s → 30s cap); replay pending operations from `chrome.storage.session` |
| Source map parsing fails | `originalPositionFor()` returns `null` or out-of-bounds position | Fall back to text-search heuristic: search source files for the element's text content or CSS class names |
| Claude Code CLI not installed / not authenticated | Process spawn fails; stderr contains "command not found" or auth errors | Detect on extension install/startup; show setup wizard with installation instructions; validate with `claude --version` |
| Claude Code CLI hangs (no output for 60s) | Watchdog timer with no stdout/stderr progress | Kill process; notify user; suggest simplifying the change request or checking Claude Code status |
| React not detected on page | `__REACT_DEVTOOLS_GLOBAL_HOOK__` undefined after page load | Wait with polling (check every 500ms for 5s); then degrade gracefully to DOM-only mode (no component names, use source map + DOM position only) |
| Side panel state desync | User sees stale element data; actions reference wrong element | Implement heartbeat between content script and side panel; re-sync on tab focus; show "Element changed — click to re-select" prompt |
| Dev server restart during operation | WebSocket to dev server's HMR also drops; fetch requests 404 | Detect dev server availability with health check polling; pause operations until server is back; notify user |
| Multiple React roots on page | Traversal finds partial tree; misses components in other roots | Detect all roots via `document.querySelectorAll('[data-reactroot]')` and React 18's `__reactContainer$` prefix; traverse all roots |

---

## Pitfall-to-Phase Mapping

| Phase Topic | Critical Pitfalls | Moderate Pitfalls | Notes |
|-------------|-------------------|-------------------|-------|
| Extension scaffolding (MV3 setup) | CP-1 (service worker lifecycle), CP-6 (side panel gesture) | Permission over-requesting; Chrome Web Store rejection | Architecture decisions here cascade through entire project |
| Element selection & highlighting | CP-5 (overlay blocks interaction) | Flicker; stacking context miscalculations; Shadow DOM edge cases | Study VisBug's custom element + Shadow DOM approach |
| Source map parsing & resolution | CP-3 (source map fetch), CP-4 (VLQ corruption) | Bundler variations; inline vs external maps; `cheap-module-source-map` column gaps | Test against Vite, Next.js, CRA from day one |
| React fiber tree integration | CP-2 (world isolation), CP-7 (production name stripping) | Multiple React versions; lazy-loaded React; custom renderers; React 19 Server Components | Main-world script injection is non-negotiable |
| WebSocket communication layer | CP-1 (service worker drops socket) | Message ordering; reconnection state replay; mixed content on HTTPS | Consider owning WebSocket from side panel, not service worker |
| Local middleware server | — | Port conflicts; process management; CORS configuration | Relatively straightforward Node.js server |
| Claude Code CLI integration | — | CLI not installed; hanging processes; output format changes; prompt engineering iteration | Use `--output-format stream-json` for progress; set timeouts; validate output |
| Screenshot & visual context | — | Viewport-only capture; offscreen elements; high-DPI scaling | Use `chrome.tabs.captureVisibleTab` + client-side crop |
| Change application & hot-reload | — | HMR failure detection; stale source maps post-change; element re-identification | Leverage dev server HMR WebSocket for change detection |
| Chrome Web Store submission | — | Over-broad permissions; missing privacy policy; vague listing description | Use minimal `host_permissions`; prepare privacy policy early; clear single-purpose description |

---

## Sources

- Chrome Developers — [MV3 Migration Checklist](https://developers.chrome.com/extensions/migrating_to_manifest_v3) (HIGH confidence)
- Chrome Developers — [Known MV3 Migration Issues](https://developer.chrome.com/docs/extensions/develop/migrate/known-issues) (HIGH confidence)
- Chrome Developers — [WebSockets in Service Workers Tutorial](https://developer.chrome.com/docs/extensions/mv3/tut_websockets) (HIGH confidence)
- Chrome Developers — [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) (HIGH confidence)
- Chrome Developers — [Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) (HIGH confidence)
- GitHub — [React Debugger Extension Edge Cases](https://github.com/hoainho/react-debugger-extension/blob/main/EDGE-CASES.md) (MEDIUM confidence)
- GitHub — [React DevTools Overview](https://github.com/facebook/react/blob/master/packages/react-devtools/OVERVIEW.md) (HIGH confidence)
- GitHub — [React DevTools MV3 Migration PR](https://github.com/facebook/react/pull/25145) (HIGH confidence)
- GitHub — [esbuild Coarse Sourcemap Segments Issue](https://github.com/evanw/esbuild/issues/4189) (HIGH confidence)
- GitHub — [Tailwind CSS Source Maps PR](https://github.com/tailwindlabs/tailwindcss/pull/17775) (MEDIUM confidence)
- GitHub — [ProjectVisBug Tool Architecture](https://github.com/GoogleChromeLabs/ProjectVisBug/wiki/Tool-Architecture) (HIGH confidence)
- GitHub — [Rollup Invalid Sourcemap Issue](https://github.com/rollup/rollup/issues/6191) (HIGH confidence)
- Claude Code Docs — [Headless/Programmatic Usage](https://code.claude.com/docs/en/headless.md) (HIGH confidence)
- StackOverflow — [Element Overlay Pointer Events](https://stackoverflow.com/questions/79577772/) (MEDIUM confidence)
- StackOverflow — [Side Panel User Gesture Error](https://stackoverflow.com/questions/77213045/) (MEDIUM confidence)
- Extension Radar — [Chrome Web Store Rejection Reasons](https://www.extensionradar.com/blog/chrome-extension-rejected) (MEDIUM confidence)
