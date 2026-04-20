# Screen: side-panel-main

<!--
Single-screen spec. Inherits Design System, tokens, principles, and shared
patterns from docs/ui.md. Every token/value below is a reference to ui.md.
-->

## References

- **Base UI doc:** [../ui.md](../ui.md) — design system, tokens, shared patterns
- **PRD:** [../prd.md](../prd.md) — upstream requirements and user stories
- **Related FR(s):** FR-01, FR-03, FR-04, FR-05, FR-09, FR-11, FR-12, FR-16, FR-19, FR-20, FR-22, FR-23, FR-24, FR-25, FR-28, FR-29
- **User story(ies):** Story 1, Story 2, Story 3, Story 5, Story 7

## Purpose

One-screen cockpit: see whether the server is alive, start Inspect, read what you just selected, describe the change, and watch the result land.

## Entry & Exit

- **Entry points:** user clicks the Inspatch extension icon on any Chrome tab → side panel opens and attaches to the active tab.
- **Exit points:** user closes the side panel (request continues server-side); user switches the active tab (panel re-evaluates localhost status — may flip to `non-localhost-blocked`); user clicks a file path in the result → jumps to the editor (external).
- **Primary user:** frontend engineer working on a React app served from `localhost`, or hand-authoring an HTML/CSS file opened directly in Chrome via `file://`.

## Layout

Vertical stack, full height, fixed header + footer, scrolling body. Page archetype: **detail / single-pane app shell** (no skeleton variant from `ui-standards.md §3.5` applies cleanly — this is a Chrome side panel, not a full page; it's a fixed-width column with header / scrolling body / footer).

| Region | Content / Components | Notes |
| ------ | -------------------- | ----- |
| Header (h-10)     | `HeaderBar` — (compact only) Inspect toggle · flex spacer · Connection status chip | `bg-ip-bg-secondary/50 backdrop-blur-sm`, bottom border `--ip-border-subtle`. The editor identity is a server concern (auto-detected) and is **not** exposed here — only the `Open in editor` action in the result surfaces it |
| Transient banner  | Error message strip (`bg-ip-warning-muted`, `animate-slide-down`) | Only when `error` state non-null |
| Body (flex-1)     | One of: `StatusGuide` / Onboarding steps + Start Inspect CTA / `EmptyState inspecting` / `EmptyState idle` / `ElementCard` + optional `ProcessingStatus` | `p-4`, `overflow-y-auto`; the `NotLocalhost` variant lives in the sibling screen `non-localhost-blocked` |
| Console-error tray (conditional) | Error-tinted collapsible `rounded-ip-md border bg-ip-error-muted` with count + clear + expand | Only when `consoleErrors.length > 0` and not processing |
| Footer            | `ChangeInput` v2 — one row `[attachments] [auto-growing textarea] [Send]`, AI-suggestion chip row below, keyboard-hint line at the bottom | `bg-ip-bg-secondary`, `animate-slide-up` on mount; textarea grows from 1 line to ~160px then scrolls; attachment chips live inline with `×`; suggestion chips fill + focus the textarea on click |
| No-source warning | Bottom warning strip (`bg-ip-warning-muted`) | Only when selected element has no `sourceFile` |

## Data Shown

| Field | Source | Format | Notes |
| ----- | ------ | ------ | ----- |
| `connectionStatus`     | `useWebSocket` hook                              | `'connected' \| 'reconnecting' \| 'disconnected' \| 'not-applicable'` | Drives header chip + guide visibility |
| `isLocalhost`          | active tab URL                                   | boolean                                           | When false, the panel flips to the `non-localhost-blocked` screen |
| `suggestedPrompts`     | static list for now; contextual derivation is an Open Question | `string[]`                                       | Feeds the suggestion-chip row under the input |
| `attachments`          | pasted or captured screenshots                   | `{ id, dataUrl, label }[]`                       | Inline chips inside the input row; sent as `screenshotDataUrl` on submit |
| `selectedElement`      | `ElementSelection` from content script           | `@inspatch/shared` schema                         | Localhost React: `tagName`, `id`, `className`, `xpath`, `componentName`, `parentChain`, `sourceFile`, `sourceLine`, `sourceColumn`, `boundingRect`, `computedStyles`. `file://` (DOM-only, FR-25): same minus `componentName` / `sourceFile` / `sourceLine` / `sourceColumn`; gains `pageSource: "file"` + absolute `filePath` |
| `pageSource`           | derived from active tab URL                      | `'localhost' \| 'file'`                           | Drives ElementCard variant + banner visibility |
| `fileUrlPermission`    | `chrome.extension.isAllowedFileSchemeAccess()`   | boolean                                           | `false` on `file://` pages without the extension's "Allow access to file URLs" toggle — triggers the permission banner (FR-28) |
| `processing`           | server `status_update`                           | `StatusUpdate` schema                             | queued / analyzing / locating / generating / applying / complete / error |
| `streamedText`         | concatenated `status_update.streamText`          | Markdown                                          | Rendered via `react-markdown` with project overrides |
| `statusLog`            | derived from non-terminal `status_update`        | `string[]`                                        | Operation log, 11px mono, auto-scrolls |
| `changeResult`         | server `change_result`                           | `ChangeResult` schema                             | `success`, `summary` (md), `filesModified[]`, `diff`, `diffMode: 'git' \| 'snapshot'` (FR-29), `error?` |
| `consoleErrors`        | page console bridge                              | `ConsoleError[]` (last 20)                        | Sent along with next `change_request` |

## Actions

| Trigger | Action | Result | Keyboard shortcut |
| ------- | ------ | ------ | ----------------- |
| Click Connection chip (when not connected) | `reconnect()`                                | WS attempts reconnect; chip pulses during reconnecting | — |
| Click Start Inspect       | `sendToContentScript('start-inspect')`                    | Content script enables targeting; Inspect toggle flips to Stop | — |
| Click Stop (compact)      | `sendToContentScript('stop-inspect')`                     | Overlay removed; body returns to idle Empty state | — |
| Hover Element card        | `sendToContentScript('highlight-element')`                | Page overlay re-paints box-model on the last selection | — |
| Leave Element card        | `sendToContentScript('clear-highlight')`                  | Page overlay cleared | — |
| Click X on Element card   | `handleClear()`                                           | Element, status, result, console errors all reset | — |
| Click source-file path    | `GET /open-in-editor?file=…&line=…&column=…`              | Server opens the file at the target line using its auto-detected editor | — |
| Type in textarea          | Grows up to ~160px; scrolls internally after              | —                                                 | — |
| Paste image in textarea   | `readImageFromClipboard` → data URL                       | Inline thumbnail chip inside the input row with `×` remove | — |
| Click attachment chip ×   | Removes that attachment from the pending request          | Chip disappears; send stays available | — |
| Click AI suggestion chip  | Writes the chip's prompt into the textarea and focuses it | Cursor lands at end; chip row scrolls to active | — |
| Click Send                | `send(changeRequest)`; writes pending state to `chrome.storage.local` | Request enqueued server-side; processing card appears | `Enter` |
| ⇧↵                        | Insert newline in textarea                                 | — | `Shift+Enter` |
| Click Try Again (error)   | `onRetry()` resets processing/result state                 | Surface returns to "element selected, input unlocked" | — |
| Click Clear on error tray | Empties console-error buffer                               | Tray hides | — |

## States

> All 8 canonical states from `references/ui-standards.md §7` are filled. Hover / Active / Focus / Disabled are stated at the primary interactive element (Send button in the footer) because the screen itself is not a single clickable target. Flow-specific states (welcome / processing / result) are listed under the canonical ones they belong to.

| State     | When it shows | What the user sees | Exit condition |
| --------- | ------------- | ------------------ | -------------- |
| **Default**   | Connected and at rest — covers 5 flow variants:<br>• **welcome (first-run)** — Inspect never used (connected, no prior selection)<br>• **connected-idle** — Inspect used, no element selected<br>• **inspecting** — Inspect mode active, no element yet<br>• **element-selected** — `ElementCard` + `ChangeInput` visible, ready to send<br>• **result-success** — completed run showing the success `ProcessingStatus` card | Respective default UI for each flow variant (onboarding steps + Start Inspect CTA / idle `EmptyState` / "inspecting" `EmptyState` / `ElementCard` + `ChangeInput` / success result card) | User progresses (click Start Inspect → inspecting → selected → send) or clears (X on card → connected-idle) |
| **Hover**     | Pointer on any card or button | Card borders swap `--ip-border-subtle` → `--ip-border-accent` + `--ip-shadow-glow-accent` (200ms); Send button brightens (`hover:brightness-110`); file path underlines | Pointer leaves |
| **Active**    | Mousedown on any button | `active:scale-95` on Send / Start Inspect / Stop / Try Again (150ms) | Mouseup |
| **Focus**     | Keyboard focus on any tabbable element | 2px `--ip-border-accent` ring + `--ip-shadow-glow-accent` (global `*:focus-visible`) | Tab / click elsewhere |
| **Disabled**  | Send button when the textarea is empty AND no attachments are present, OR when no element is selected; Start Inspect never disabled once WS is connected | Send is `bg-ip-bg-tertiary text-ip-text-muted cursor-not-allowed`; textarea still editable | User types / attaches / selects element |
| **Loading**   | **processing** — between send and final result | `ElementCard` + in-flight `ProcessingStatus` card: spinner (`animate-spin`) + status label + `animate-shimmer` overlay + operation log + streamed markdown; Send button reverts to disabled | `change_result` received → flips to result-success / result-failure |
| **Empty**     | **connected-idle after first use** — server connected, Inspect used at least once, no element selected, no in-flight request, no result | Idle `EmptyState` card: icon + "No element selected" + subtle hint to click Inspect again | User clicks Inspect |
| **Error**     | Five distinct failure sources:<br>• **disconnected** — WS not connected → `StatusGuide` explaining how to start `@inspatch/server`<br>• **reconnecting** — transient drop → chip pulses `--ip-warning` + `animate-pulse`, body keeps last valid content<br>• **content-script error** — extension can't reach the page → top `animate-slide-down` banner "Content script not loaded — refresh the page and try again"<br>• **file-URL permission missing** — active tab is `file://` and `fileUrlPermission === false` → inline guidance banner above the body (not transient) with copy-able `chrome://extensions/?id=<id>` instructions; Inspect button disabled until the user enables the toggle and reopens the panel (FR-28)<br>• **result-failure** — Claude returned `success: false` → `ProcessingStatus` failure variant with reason + Try Again | Error-tinted copy, never coloured-only — icon + label + colour together | WS reconnects / user reloads page / user enables "Allow access to file URLs" / user clicks Try Again |

## Copy

| Key / Location | Copy | Notes |
| -------------- | ---- | ----- |
| Status chip · connected       | `Connected` | pairs with green dot + `animate-ping` halo |
| Status chip · reconnecting    | `Reconnecting…` | yellow dot + `animate-pulse` |
| Status chip · disconnected    | `Disconnected` | grey dot |
| Status chip · not-applicable  | `—` | on non-localhost tabs; neutral grey dot, no halo |
| Onboarding · step 01 | `Inspect an element` · `Click any DOM node on your localhost page` | `--ip-text-secondary` / `--ip-text-muted` |
| Onboarding · step 02 | `Describe the change` · `Type a prompt or paste a screenshot` | |
| Onboarding · step 03 | `Claude edits your code` · `Source file updated live in your editor` | |
| CTA                  | `Start Inspect` | With `CrosshairIcon` |
| CTA helper           | `Click any element on the page` | `text-[11px] text-ip-text-muted` |
| Inspect (compact)    | `Inspect` / `Stop` | Gradient / red-glow respectively |
| Textarea placeholder | `Describe the change… (⌘V to paste screenshot)` | |
| Send hint            | `↵ Send · ⇧↵ New line` | `text-[10px] text-ip-text-muted/50` |
| Suggestion chip · tighten       | `Tighten spacing` | 11px, `--ip-text-secondary` |
| Suggestion chip · premium       | `Make it look premium` | |
| Suggestion chip · brand accent  | `Use the brand accent` | |
| Suggestion chip · explain       | `Explain this component` | |
| Suggestion chip · a11y          | `Improve accessibility` | |
| Status labels        | `Queued` · `Analyzing` · `Locating files` · `Generating` · `Applying changes` · `Complete` · `Error` | Source: `ProcessingStatus.statusLabels` |
| Failure guidance     | `Try a simpler change description, or increase the server timeout.` / `The request was cancelled. Try again when ready.` / `Check the server terminal for details…` | Branches by error keyword |
| Console-error tray   | `⚠ {n} console error(s) — will be sent to Claude` | `--ip-error` |
| No-source warning    | `No source file detected — changes may require manual file lookup. Ensure your dev server has source maps enabled.` | `--ip-warning` |
| Content-script error | `Content script not loaded — refresh the page and try again` | Transient top banner |
| ElementCard source label · localhost | `{componentName}` in `--ip-text-accent` mono + source path line below | Shown when `pageSource === 'localhost'` |
| ElementCard source label · file      | `Local HTML file` pill (11px, `--ip-text-secondary`) + absolute `filePath` below in mono, truncated with `title` tooltip | Shown when `pageSource === 'file'`; replaces the component-name segment |
| Permission banner · title | `Enable file:// access to inspect this page` | `--ip-warning` icon + `text-[13px] font-semibold` |
| Permission banner · body  | `Open chrome://extensions/?id={extensionId}, find Inspatch, and enable "Allow access to file URLs". Reopen this panel after.` | `text-[12px] --ip-text-muted`; the `chrome://` string is rendered in a mono code chip with a copy-to-clipboard button (Chrome extensions cannot navigate `chrome://` URLs) |
| Permission banner · copy button | `Copy link` | After copy → `Copied` for 1.5s |
| Result · diffMode badge · snapshot   | `snapshot diff` pill next to the result-card header | 10px mono, `--ip-text-muted`; only shown when `changeResult.diffMode === 'snapshot'` (FR-29) |

## Responsive Behavior

The side panel width is user-resizable via Chrome's built-in gripper (roughly 300–600px in practice). There are no breakpoint changes; the layout is a single column designed to read at any width within that range.

| Breakpoint         | Layout adjustments |
| ------------------ | ------------------ |
| Mobile (<768px)    | n/a — Chrome side panel is desktop-only |
| Tablet (768–1024)  | n/a |
| Desktop (>1024px)  | Single-column fluid; textarea stretches; `ElementCard` long values truncate with `title` tooltip |

## Accessibility

- **Tab order:** Inspect toggle (when compact) → Connection chip → body (Start Inspect CTA / Element card X / source-file link / parent-chain toggle / console-error tray header / clear / expand) → Attachment chip × (each) → Textarea → Suggestion chips → Send.
- **Focus management:** Focus is **not** moved when the processing card or result card appears (known gap — Open Questions). Focus ring uses the global `*:focus-visible` style (2px `--ip-border-accent` + accent glow).
- **Keyboard shortcuts:** Enter = Send; ⇧↵ = newline. No global shortcuts (no `Cmd+K`, no `Esc` on the panel itself — ESC is handled inside the inspect overlay, not the panel).
- **ARIA labels:** Stop / Start Inspect / Send / Clear / Remove image / Reconnect chip all carry `title` attributes today. Moving to `aria-label` is an Open Question.
- **Screen reader flow:** Header announces connection state; body announces either guide text, onboarding steps, or the element's tag name, component name, and source path; status card announces the status label on each transition (no explicit `aria-live` region today).

## Motion & Feedback

- **Enter / exit:** `HeaderBar` no motion (always on); transient error banner uses `animate-slide-down`; `ElementCard` uses `animate-slide-up` on first mount; `ProcessingStatus` result card uses `animate-fade-in-scale`; onboarding step rows stagger `animate-fade-in` at 60ms intervals.
- **State transitions:** Status label colour crossfades over 300ms (`transition-colors duration-300`). In-flight status card overlays a continuous `animate-shimmer` (2s linear infinite) + a 3-ring spinner (`animate-spin`).
- **Hover / press feedback:** Cards hover → swap `border-ip-border-subtle` → `border-ip-border-accent` + `shadow-ip-glow-accent`, 200ms. Buttons press → `active:scale-95`, 150ms. Primary CTA hover → `hover:brightness-110 hover:shadow-ip-glow-accent`.
- **Attention:** Active Stop button loops `animate-glow-pulse` (2s) — the only "look at me" loop on the surface.

## Edge Cases

- Active tab flips to an unsupported URL mid-session (http(s) non-localhost) → body swaps to the `non-localhost-blocked` screen; header remains (connection chip neutralised). Pending requests continue server-side and resurface when the user returns to a supported tab.
- Active tab flips to `file://` → body stays on `side-panel-main`; if `fileUrlPermission === false`, the permission banner appears above the body and Inspect is disabled. Component-name fields in any subsequent `ElementCard` are empty by design — see [./inspect-overlay.md](./inspect-overlay.md) DOM-only mode.
- Server restart while a request is in flight → on reconnect, `resume` is sent; server replies `resume_not_found`; the panel clears pending state and returns to idle. No ghost "processing" card.
- Page reloads on the *inspected* tab (not others) → element + processing + result state reset; other tabs do not cause a reset (`inspectTabId` check).
- Long XPath / long file path → truncate with CSS, full value on `title` tooltip. Source path over 3 segments is shown as `…/last/three/parts`.
- Long component parent chain (> 3) → collapsed to last 3 with leading `…`; click to expand.
- Pasted image > WS max message size → request may fail; handled by general error path (Try Again). No pre-send size check today (Open Question).
- Console-error buffer exceeds 20 → oldest entries dropped (bounded at 20 in-memory).
- `consoleErrors` cleared automatically when a request is sent, not just when the tray is closed.

## Analytics / Events

No analytics instrumentation (per PRD: zero-upload promise). Whether telemetry is ever added is an Open Question in the PRD.

| Event name | Trigger | Properties |
| ---------- | ------- | ---------- |
| n/a | n/a | n/a |

## Open Questions

- Should focus auto-advance into the textarea when an element is selected?
- Should `prefers-reduced-motion` gate `animate-shimmer`, `animate-glow-pulse`, `animate-ping`, and `animate-spin`?
- Replace `title` attributes with `aria-label` on all icon-only buttons (Stop, X, Send, Remove image, Reconnect chip)?
- Should the result card receive focus or an `aria-live="polite"` region so SR users are notified on completion?
- On `file://` pages, should the suggestion chip row swap to HTML-centric prompts ("inline this stylesheet", "add a favicon link", "fix meta viewport") instead of the React-leaning defaults?
- Should the permission banner also appear once on localhost pages if the extension detects a recent `file://` attempt was blocked, as a proactive nudge?

## Out of Scope

- Multi-tab / split view — one panel, one active tab.
- History across sessions — the 24h result buffer lives server-side and is only replayed for the currently-inspected tab.
- Theming — there is one theme (dark). A light mode would need a new token pass.
- The blocked / welcome variant for non-localhost tabs — see [./non-localhost-blocked.md](./non-localhost-blocked.md).
- Post-result detail rendering — see [./result-detail.md](./result-detail.md).
