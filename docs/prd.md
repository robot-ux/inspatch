# Product Requirements Document

## Overview

- **Feature / Product:** Inspatch — a local developer tool that lets you "click a UI element on localhost **or a local HTML file** and have Claude edit the source code"
- **Author:** Inspatch core team
- **Date:** 2026-04-17
- **Version:** v0.2.0 (planned — adds Quick/Discuss mode with plan approval; v0.1.4 currently published on npm as `@inspatch/server`)
- **Related docs:**
  - UI: [./ui.md](./ui.md)
  - Frontend: [./fe.md](./fe.md)
  - API: [./api.md](./api.md)
  - QA: [./qa.md](./qa.md)

## Problem Statement

During frontend development, the loop of "see something to change in the UI → locate the source → find the component/style → edit it" is long and lossy:

- What you see in the browser has no direct mapping to source files. DevTools only exposes compiled DOM/CSS, not the originating React component file.
- Even with AI coding tools (Claude Code, Cursor), users must manually translate "that button I want to change" into text (component name, location, context) — slow and error-prone.
- Visual signals (screenshots, computed styles, bounding boxes) are hard to hand to an AI without loss, so users often need multiple rounds of clarification before the AI understands the target.
- The same friction exists outside framework projects: engineers writing plain HTML/CSS (prototypes, landing pages, email templates, documentation fragments) have no way to click → describe → edit either, because every existing tool assumes a bundler and a dev server.

**Target users:** Frontend engineers working on React apps served from `localhost`, **or writing standalone HTML/CSS files opened directly in Chrome as `file://`**, who already have the Claude Code CLI installed and use AI-assisted coding regularly.

**Impact if we don't solve it:** AI coding efficiency is throttled by the cost of describing "which element" rather than the actual change. Visually-driven tweaks (color, spacing, copy) can't be closed in the browser — users are forced back to the editor to locate source by hand.

## Goals

### Success criteria

- Users can **click any element on localhost or on a local `file://` HTML page**, type a sentence in natural language, and have the change applied to source without leaving the browser.
- Claude locates the right component file and applies the requested change **in a single request** with a hit rate ≥ 85%.
- End-to-end latency from "Send" to "git diff returned" is P50 ≤ 30s, P95 ≤ 90s.
- The request queue survives reconnects and exposes the last 24h of results.

### Metrics

| Metric | Target |
| ------ | ------ |
| Single-shot hit rate (no manual follow-up) | ≥ 85% (measured on localhost React flow; DOM-only `file://` baseline TBD — see Open Questions) |
| End-to-end latency P50 / P95 | ≤ 30s / ≤ 90s |
| Weekly active users (WAU) | 500 within 3 months of launch |
| `@inspatch/server` monthly npm downloads | 2,000 within 3 months of launch |
| Error rate (Claude failures + connection failures) | ≤ 5% |

## Non-Goals

- **No production or remote websites.** Supported page sources are `localhost` / `127.0.0.1` / `*.local` and `file://` HTML files on the user's own machine — never deployed sites, never remote static hosts, never build artifacts (`dist/`, `build/`, `.next/`, etc.).
- **No build-output editing.** When the target is a `file://` page, Inspatch edits the HTML the user is hand-authoring; it does not attempt to map compiled HTML back to framework source.
- **No cloud proxy.** Claude Agent SDK runs on the user's machine; source code and API keys never leave it.
- **No multi-user collaboration.** Single-user, single-machine only; no team sharing or real-time co-editing.
- **No component detection for non-React frameworks.** v1 relies on React Fiber for `componentName` and source position. Vue / Svelte / Angular are out of scope.
- **No rich chat UI.** The side panel is a "describe → send → view result" surface, not a general chatbox.
- **Not an IDE replacement.** Inspatch targets visually-driven micro-edits. Large refactors should still go through the Claude Code CLI directly.

## User Stories

### Story 1: Developer can modify a selected UI element with natural language

**As a** frontend developer debugging a React app locally
**I want to** click an element in the browser and type "make this button red and rounded"
**So that** I don't have to switch to the editor to locate source — Claude edits the file directly

**Acceptance criteria:**

- [ ] Given a React component rendered on localhost, when I click Inspatch's Inspect button and select the element, the side panel displays its `componentName` and `sourceFile`.
- [ ] Given a selected element, when I type a description and click Send, the server logs show a `change_request` received and enqueued.
- [ ] Given Claude finishes processing, when I return to the side panel, I see the `change_result` with a git diff and the list of modified files.

### Story 2: Developer can attach a screenshot for visual reference

**As a** developer making precise visual tweaks (color, spacing, alignment)
**I want to** paste or attach a screenshot of the current page, see it as a thumbnail preview inside the input, and send it alongside my description
**So that** Claude has a visual anchor alongside my description, reducing ambiguity

**Acceptance criteria:**

- [ ] Given a selected element, when I paste an image or click the attach-screenshot affordance, a thumbnail chip appears inside the input with a remove `×`.
- [ ] The request sent to the server includes `screenshotDataUrl`, and Claude's prompt references it.
- [ ] The thumbnail chip has a max dimension and never pushes the Send button off-row.

### Story 3: Developer can see live progress during a request

**As a** developer waiting on a Claude-driven edit
**I want to** see a status stream "queued → analyzing → locating → generating → applying → complete"
**So that** I know what step is in flight, can estimate time left, and avoid double-sending

**Acceptance criteria:**

- [ ] The server pushes `status_update` messages as a stream.
- [ ] The side panel renders each state with a visible indicator (progress bar or label).
- [ ] If Claude emits streaming text, `streamText` is rendered incrementally.

### Story 4: Developer can jump from a result straight to the source file

**As a** developer who wants to verify or continue editing after Claude's change
**I want to** click a filename in the result and open it at the right line in my editor
**So that** I can continue fine-tuning or code review without hunting

**Acceptance criteria:**

- [ ] Each entry in `filesModified` is clickable in the side panel.
- [ ] Clicking triggers `POST /open-in-editor`; the server opens the file at the target line using the editor it auto-detected at startup.
- [ ] The side panel never asks the user to choose an editor — detection is a server concern; `--editor cursor|vscode` CLI flag remains the only manual override.

### Story 5: Developer can recover recent results after a reconnect

**As a** developer on a flaky network, or one who accidentally closed the side panel
**I want to** see results from recently-completed requests when the extension reconnects
**So that** I don't lose Claude's changes or their diffs

**Acceptance criteria:**

- [ ] On reconnect, the extension sends `resume_request`; the server returns results cached within the last 24h.
- [ ] In-flight requests continue processing — they are not dropped because the extension reconnected.

### Story 6: Developer is told clearly when Inspatch can't run on the current tab

**As a** developer who opened the Inspatch side panel while on a non-localhost tab (e.g. a production site, docs, GitHub)
**I want to** see a clear, friendly blocked state explaining "Inspatch only works on localhost" with the current URL surfaced
**So that** I don't waste time clicking Inspect expecting it to work

**Acceptance criteria:**

- [ ] When the active tab's URL host is not `localhost` / `127.0.0.1` / `*.local`, the side panel body renders a dedicated blocked state — not the onboarding or empty state.
- [ ] The blocked state shows the current URL (monospaced), a single-line explanation, and a primary action `Open localhost:3000` (or the last-known localhost URL) plus a secondary link to the docs.
- [ ] The header's connection chip degrades to a neutral "not applicable" treatment — no red/yellow error state, since the server health is irrelevant on this tab.
- [ ] Switching to a localhost tab restores the normal surface within one tick.

### Story 7: Developer can edit a standalone local HTML file

**As a** frontend developer hand-authoring a standalone HTML/CSS file (prototype, landing page, email template) opened in Chrome via `file:///...`
**I want to** click an element on that page, describe a change, and have Claude edit the HTML / sibling CSS / sibling JS directly
**So that** I can iterate on static HTML without standing up a dev server or bundler

**Acceptance criteria:**

- [ ] Given a `file:///path/to/page.html` page with the extension's "Allow access to file URLs" enabled, when I open the Inspatch side panel, I see the normal surface — **not** the `non-localhost-blocked` state.
- [ ] Given Inspect mode on a `file://` page, when I click an element, the side panel displays its XPath, tag, classes, and computed styles; `componentName` / `sourceFile` are absent (no React Fiber), and the selected-element card clearly labels the source as "Local HTML file" with the absolute file path.
- [ ] The `change_request` sent to the server includes `pageSource: "file"` and the `filePath` derived from the page URL; the server accepts it even when `--project` points at a non-Git directory.
- [ ] Claude's edit lands in the target HTML (or a `<link>`/`<script src>` sibling resource under `--project`), and the `change_result` returns a snapshot-mode diff (`diffMode: "snapshot"`) when the project is not a Git repo.
- [ ] If the user has not enabled "Allow access to file URLs" for the Inspatch extension, clicking Inspect on a `file://` page surfaces a one-time guidance banner with copy-able `chrome://extensions/?id=<id>` instructions (Chrome extensions cannot navigate `chrome://` URLs programmatically) — not a silent failure.

### Story 8: Developer can preview a plan before risky edits

**As a** developer about to request a structural or ambiguous change
**I want to** see Claude's plan first and approve it before any file is touched
**So that** I don't have to revert a bad edit when the request had multiple plausible interpretations

**Acceptance criteria:**

- [ ] The side panel's change input exposes a **Quick / Discuss** toggle. Quick is the default; Discuss forces plan-first.
- [ ] In Quick mode, small visual tweaks (color, font-size, spacing, border-radius, shadow, single-element layout) apply directly without a plan round-trip.
- [ ] In Quick mode, Claude auto-escalates to plan-first when the change requires DOM structure edits, touches a shared class/component used in 3+ places, is ambiguous enough that multiple interpretations materially differ, or would introduce a new dependency or file.
- [ ] In Discuss mode, Claude never calls Edit/Write/MultiEdit/Bash — it outputs exactly one `## Plan` block (Goal / Files / Approach / Risk) and stops.
- [ ] When a plan is produced, the side panel renders a plan card with the plan text plus `Apply plan` and `Cancel` buttons; the change input is disabled while the plan is pending.
- [ ] `Apply plan` re-runs Claude in Quick mode with the approved plan attached so Claude executes without re-planning; `Cancel` discards the plan and returns the panel to element-selected state.
- [ ] Pending plans expire after 10 minutes of no response. On WebSocket reconnect within that window, `resume_request` replays the pending plan alongside in-flight and recent results.

## Information Architecture

```
<Inspatch Chrome Extension>
├── <Side Panel Main>          # connection status, Inspect toggle, selected-element card, input + Send, request history
│   ├── <Blocked — Non-localhost>  # shown when the active tab isn't a supported localhost URL
│   └── <Result Detail>        # expanded view of a single request: status timeline, streamed text, git diff, filesModified list
└── <Inspect Overlay>          # injected into the inspected page: hover highlight rect + size + component-name tooltip
```

Non-UI surfaces (out of the IA but part of the product):

- `@inspatch/server` CLI — launched via `npx @inspatch/server <dir>`.
- Local HTTP endpoints — `GET /health`, `POST /open-in-editor`.
- Local WebSocket — `ws://127.0.0.1:9377` (protocol defined by Zod schemas in `packages/shared`).

## User Flows

### Flow: Story 1 — Modify a selected element

```
Side Panel Main → click Inspect → Inspect Overlay (hover → click element)
→ Side Panel Main (selected-element card populated)
→ type description → Send → status stream → Result Detail (git diff rendered)
```

### Flow: Story 2 — Attach a screenshot

```
Side Panel Main (element already selected) → toggle "Attach screenshot"
→ Inspect Overlay captures viewport → Side Panel Main (preview thumbnail)
→ Send → Result Detail
```

### Flow: Story 3 — Watch live progress

```
Side Panel Main (Send) → status badge: queued → analyzing → locating → generating → applying
→ Result Detail auto-expands on complete → git diff visible
```

### Flow: Story 4 — Open a modified file in the editor

```
Result Detail → click filename in filesModified
→ POST /open-in-editor → editor (Cursor / VS Code) opens file at target line
```

### Flow: Story 5 — Recover results after reconnect

```
Extension reconnects → WebSocket open → send resume_request
→ Side Panel Main request history repopulated with last 24h → Result Detail available for each
```

### Flow: Story 6 — Non-localhost tab

```
User opens side panel on https://example.com
→ Side Panel Main evaluates active tab URL → renders Blocked — Non-localhost state
→ user switches to http://localhost:3000 → panel re-evaluates → normal Side Panel Main
```

### Flow: Story 7 — Edit a local HTML file

```
User opens file:///Users/me/landing/index.html in Chrome
→ Side Panel Main evaluates active tab URL → recognizes file:// as supported
→ click Inspect → Inspect Overlay (DOM-only path, no Fiber) → select element
→ Side Panel Main (card: "Local HTML file" + absolute path) → describe → Send
→ Server (--project = file's dir, non-Git) → Claude edits HTML/CSS/JS
→ Result Detail (diffMode: "snapshot", filesModified listed)
```

## Screens

> Index only. Full per-screen detail lives in [./ui.md](./ui.md).

| Screen | Purpose | Primary actions | Detail |
| ------ | ------- | --------------- | ------ |
| side-panel-main | Connection status, Inspect entry, selected-element card, description input, request history | Toggle Inspect, type + Send, open result, cancel in-flight | → [./ui.md#side-panel-main](./ui.md) |
| non-localhost-blocked | State of side-panel-main shown when the active tab is neither a supported localhost URL nor a `file://` HTML page; includes a first-time `welcome` variant that introduces the product before the blocked explanation | Navigate to a localhost dev server or a local HTML file, open docs | → [./ui.md#non-localhost-blocked](./ui.md) |
| inspect-overlay | Visual targeting layer injected into the inspected page | Hover highlight, click-to-select, ESC to cancel | → [./ui.md#inspect-overlay](./ui.md) |
| result-detail | Single-request result view: status timeline, streamed text, git diff, modified-files list | Expand/collapse, open file in editor, copy diff | → [./ui.md#result-detail](./ui.md) |

Notable states of `side-panel-main` (one screen, many states — see the State Matrix below for the full 8-state grid):

- **welcome (first-run)** — connected, Inspect never used; shows the 01/02/03 onboarding steps + `Start Inspect` CTA.
- **disconnected** — WS not connected; shows `StatusGuide` explaining how to start `@inspatch/server`.
- **connected-idle** — after first use, no element selected; shows the idle `EmptyState`.
- **element-selected** — `ElementCard` + `ChangeInput` ready for a description.
- **processing** — in-flight request; shows the processing card with status stream.
- **awaiting-plan-approval** — Claude emitted a `## Plan` block (either Discuss mode or quick-mode auto-escalation); the panel renders a plan card with `Apply plan` / `Cancel`, and the change input is disabled until the user responds.
- **result-success / result-failure** — terminal states after `change_result` lands (see `result-detail`).

## Functional Requirements

| ID    | Requirement | Screen(s) | Priority |
| ----- | ----------- | --------- | -------- |
| FR-01 | Chrome extension exposes an "Inspect mode": hover highlights the DOM, click selects the element and shows its info in the side panel | inspect-overlay, side-panel-main | P0 |
| FR-02 | On localhost React pages, the extension captures `componentName`, `sourceFile`, `sourceLine`, `sourceColumn` via a React Fiber main-world script. On `file://` pages these fields are omitted (see FR-25) | inspect-overlay | P0 |
| FR-03 | Extension collects `xpath`, `boundingRect`, `computedStyles`, optional `screenshotDataUrl`, optional `consoleErrors` | inspect-overlay | P0 |
| FR-04 | Extension talks to the local server over `ws://127.0.0.1:9377`; all messages are validated by shared Zod v4 schemas | side-panel-main | P0 |
| FR-05 | Server processes `change_request` sequentially via `RequestQueue`, streams `status_update`, returns a final `change_result` | side-panel-main, result-detail | P0 |
| FR-06 | Server invokes `@anthropic-ai/claude-agent-sdk` with `permissionMode: "acceptEdits"`. Allowed tools depend on request mode: Quick mode gets `Read/Edit/Write/MultiEdit/Bash/Grep/Glob`; Discuss mode (and auto-escalated Quick runs that emit a plan) are restricted to `Read/Grep/Glob`. System prompt is the SDK `claude_code` preset plus the Inspatch UI-editor append defined in FR-33 | n/a (server internal) | P0 |
| FR-07 | After Claude completes, the server returns `diff` + `filesModified` in `change_result`. Diff mechanism depends on the project (Git → `git diff`; non-Git → snapshot-mode diff) — see FR-18 and FR-29 | result-detail | P0 |
| FR-08 | Server exposes `GET /health` (health check) and `POST /open-in-editor` (open file) HTTP endpoints | result-detail | P1 |
| FR-09 | Server auto-detects the editor (Cursor / VS Code) at startup and uses it for every `open-in-editor` call; the side panel never exposes an editor picker. `--editor` CLI flag is the sole manual override | result-detail | P1 |
| FR-10 | CLI accepts `-p/--project <dir>` (or positional `<dir>`), `--port`, `--editor`, `--timeout` | n/a (CLI) | P0 |
| FR-11 | Request queue retains completed results for 24h; supports `resume_request` to replay history | side-panel-main | P1 |
| FR-12 | Side panel shows request list, status progress, streamed text, and the final git diff | side-panel-main, result-detail | P0 |
| FR-13 | Clicking a file in `filesModified` triggers `open-in-editor` and jumps to the target line | result-detail | P1 |
| FR-14 | `@inspatch/server` publishes to npm via `bin/run.cjs`; `npx @inspatch/server ./my-app` is a one-command start | n/a (distribution) | P0 |
| FR-15 | Extension ships as a zip on GitHub Releases, installable via Chrome's "Load unpacked" | n/a (distribution) | P0 |
| FR-16 | Claude runner timeout (default 1800s) kills the run and returns an `error` status | side-panel-main | P1 |
| FR-17 | All WebSocket schemas live in `packages/shared/src/schemas.ts` and are shared by both packages | n/a (shared protocol) | P0 |
| FR-18 | On startup, if `--project` is missing or non-existent, the server fails with a clear message. If the project is a Git repo, `change_result.diff` is produced via `git diff`; otherwise the server falls back to snapshot-mode diff (see FR-29) — a non-Git project is **not** a startup failure | n/a (CLI) | P1 |
| FR-19 | Requests can include optional `consoleErrors` (recent page errors) to give Claude more context | inspect-overlay | P2 |
| FR-20 | "Cancel current request" is supported (extension button + server-side interrupt of the Claude child process) | side-panel-main | P2 |
| FR-21 | Side panel renders a dedicated `non-localhost-blocked` state whenever the active tab is neither a supported localhost URL (`localhost` / `127.0.0.1` / `*.local`) nor a `file://` URL; surfaces the current URL, a primary "Open localhost:3000" action, and a docs link. First-time users (no prior `lastLocalhostUrl` in `chrome.storage.local`) see a `welcome` variant: a short "What is Inspatch?" lede above the blocked card, so the very first impression isn't a raw error surface | non-localhost-blocked | P0 |
| FR-22 | Change-description input is a single row `[attachments] [auto-growing textarea] [Send]`; the textarea grows from 1 line up to a capped max height (≈ 160px), then scrolls internally. Pasted or attached screenshots appear as inline thumbnail chips with a remove `×` | side-panel-main | P0 |
| FR-23 | Below the input, a horizontally-scrollable row of AI suggestion chips ("make this more prominent", "tighten spacing", "use brand accent", "explain this component", etc.) — click fills the textarea and focuses it. Chips are contextual to the selected element when possible, static fallback otherwise | side-panel-main | P1 |
| FR-24 | Extension recognizes `file://` URLs as a supported page source: the `non-localhost-blocked` state is not shown, and the side panel renders the normal surface. Only http(s) URLs outside the localhost allowlist trigger the blocked state | side-panel-main, non-localhost-blocked | P0 |
| FR-25 | On a `file://` page, Inspect Overlay runs in **DOM-only mode**: the React Fiber main-world script is skipped; `componentName` / `sourceFile` / `sourceLine` / `sourceColumn` are omitted. The captured request carries `pageSource: "file"` and `filePath` (absolute path decoded from the page URL), alongside the usual `xpath`, `boundingRect`, `computedStyles`, and optional `screenshotDataUrl` | inspect-overlay, side-panel-main | P0 |
| FR-26 | When `pageSource === "file"`, the Claude runner switches prompt templates: it instructs Claude to edit the target HTML and any `<link rel="stylesheet">` / `<script src>` siblings resolvable under `--project`, and **not** to search for a framework component. React-only guidance is omitted from the system prompt for these requests | n/a (server internal) | P0 |
| FR-27 | Server CLI accepts an HTML file path for `--project` (e.g. `npx @inspatch/server ./landing/index.html`). When the argument resolves to a file, the server uses its parent directory as the effective `--project` and records the original file as the implied target of the first request if the extension hasn't sent one yet | n/a (CLI) | P1 |
| FR-28 | Installation docs call out that `file://` support requires enabling "Allow access to file URLs" for the Inspatch extension in `chrome://extensions`. If a user clicks Inspect on a `file://` page while this permission is missing, the side panel shows a one-time guidance banner with a deep link to the extension details page — no silent failure | side-panel-main, inspect-overlay | P1 |
| FR-29 | When `--project` is not a Git repo, the server produces `change_result.diff` via **snapshot-mode diff**: before running Claude, it hashes + stores the content of every file Claude reads/edits; after completion, it computes a unified diff against those snapshots. `change_result` includes `diffMode: "git" \| "snapshot"` so the extension can label the result accordingly | result-detail | P1 |
| FR-30 | `change_request` carries `mode: "quick" \| "discuss"` (default `quick`). The side panel's change input exposes the toggle so users can force plan-first from the extension | side-panel-main | P0 |
| FR-31 | In `quick` mode, Claude auto-escalates to plan-first (no edit tools called, `## Plan` block emitted instead) when the change requires DOM-structure edits, touches a shared class/component used in 3+ places without a local-override path, is ambiguous enough that multiple interpretations produce materially different outcomes, or would introduce a new dependency/file. Small visual tweaks always apply directly | side-panel-main | P0 |
| FR-32 | Server sends `plan_proposal { requestId, plan }` when Claude emits a plan. Extension renders a plan card with `Apply plan` / `Cancel`, which send `plan_approval { requestId, approve: true \| false }`. Approval re-runs Claude in `quick` mode with the approved plan attached so it executes without re-planning; cancellation discards the plan. Pending plans have a 10-minute TTL and are replayed by `resume_request` alongside in-flight and recent results | side-panel-main | P0 |
| FR-33 | Claude runs use the SDK `claude_code` system prompt with an appended **Inspatch UI-editor system prompt** (scope rules, UI code-quality rules, mode-of-operation, plan block format). The project's `CLAUDE.md` is **not** loaded — the Inspatch prompt is the sole project-level instruction source. `discuss`-mode runs (and auto-escalated quick runs) restrict `allowedTools` to `Read/Grep/Glob` | n/a (server internal) | P0 |

Priority: `P0` = must have, `P1` = should have, `P2` = nice to have.

## State Matrix

> One row per screen. ✓ = designed, ✗ = missing, n/a = does not apply.

| Screen | Default | Empty | Loading | Error | Success | Offline | Blocked | Permission-denied |
| ------ | ------- | ----- | ------- | ----- | ------- | ------- | ------- | ----------------- |
| side-panel-main | ✓ (welcome = first-run onboarding; connected-idle = after first use) | ✓ (no history) | ✓ (connecting / in-flight request / awaiting-plan-approval — plan card rendered, input disabled) | ✓ (WebSocket disconnected, Claude error) | ✓ (completed entries in history) | ✓ (disconnected: server not running → `StatusGuide`; reconnecting: chip pulses + banner) | ✓ (non-localhost URL — see `non-localhost-blocked` screen) | n/a |
| non-localhost-blocked | ✓ (blocked card with remembered localhost URL) | ✓ (welcome variant: first-time open on a non-localhost tab — intro lede before the blocked card) | n/a | ✓ (`chrome.tabs` permission missing → fallback copy, no primary CTA) | n/a | n/a | ✓ (this screen *is* the blocked state) | n/a |
| inspect-overlay | ✓ (React mode with Fiber; DOM-only mode on `file://` pages — see FR-25) | n/a | n/a | ✓ (Fiber lookup failed → fallback to DOM info) | ✓ (element selected) | n/a | n/a | ✓ (host permission missing for current origin; "Allow access to file URLs" not granted on a `file://` page) |
| result-detail | ✓ | ✓ (before first status_update) | ✓ (status stream in flight) | ✓ (error status + message) | ✓ (git diff + filesModified) | n/a | n/a | n/a |

## Non-Functional Requirements

- **Performance:**
  - WebSocket message RTT (excluding Claude execution) ≤ 50ms on loopback.
  - Inspect-mode hover highlighting has no perceptible lag (≥ 50fps).
  - Server process resident memory ≤ 200MB (excluding Claude child processes).
- **Security:**
  - All listeners bind to `127.0.0.1` only; never exposed on a public interface.
  - Extension host permissions limited to `http://localhost/*`, `http://127.0.0.1/*`, explicitly-granted local domains, and (opt-in) `file:///*` via Chrome's "Allow access to file URLs" toggle.
  - Server only edits files under the resolved `--project` directory; `change_request.filePath` must resolve inside that root or the request is rejected.
  - Server does not log source content; logs keep only file paths and length summaries.
  - Claude Agent SDK runs with `permissionMode: "acceptEdits"` — edits allowed, arbitrary execution not (Bash tool is only used for git/search).
  - No code, prompt, or diff content is sent to any third party.
- **Reliability / Uptime:**
  - Queue preserves request order; exceptions never lose a request; completed results are queryable for 24h.
  - WebSocket auto-reconnects with exponential backoff; reconnect restores recent results.
  - Claude runner exceptions (timeout, process exit) always return an explicit `error` state to the extension.
- **Scalability:**
  - Protocol uses Zod discriminated unions; new message types do not break old clients.
  - Monorepo structure (Bun workspaces) keeps extension / server / shared independently releasable.
- **Accessibility:**
  - Side panel is keyboard-navigable with a correct tab order and visible focus rings.
  - Color contrast meets WCAG AA.
  - Status flow uses text + icon (not color alone) to convey state.

## Technical Notes

> Short sketch only. Full detail belongs in [./fe.md](./fe.md) and [./api.md](./api.md).

- **Runtime / framework:** Bun runtime + strict TypeScript; extension built with WXT (Chrome MV3) + React 19 + Tailwind v4; server is native Bun HTTP + WebSocket.
- **Key dependencies:** `@anthropic-ai/claude-agent-sdk` (local Claude invocation), WXT (extension build), Zod v4 (shared protocol), React 19.
- **Key protocol / data flow:** Extension captures element context → sends `change_request` (carrying `pageSource: "localhost" | "file"`, `mode: "quick" | "discuss"`, plus Fiber info on localhost / `filePath` on `file://`) over `ws://127.0.0.1:9377` → server `RequestQueue` serializes work → `claude-runner` picks prompt template by `pageSource`, appends the Inspatch UI-editor system prompt to the SDK's `claude_code` preset, and calls the Agent SDK (tools `Read/Edit/Write/MultiEdit/Bash/Grep/Glob` in quick mode; `Read/Grep/Glob` in discuss mode and auto-escalated quick runs) → if Claude emits a `## Plan` block instead of editing, the server stashes the request (10-min TTL) and sends `plan_proposal`; on `plan_approval { approve: true }` the request is re-queued in quick mode with the approved plan attached so Claude executes without re-planning → server computes `git diff` (or snapshot-mode diff when the project is not a Git repo) → streams `status_update` and returns `change_result` (including `diffMode`) to the extension.
- **Detail:** see [./fe.md](./fe.md) and [./api.md](./api.md).

## Open Questions

| Question | Owner | Due |
| -------- | ----- | --- |
| Do we ship a Firefox / Safari version? v1 is Chrome-only — is that still the plan for v2? | Core team | 2026-05-15 |
| Do we pursue Chrome Web Store distribution? Current sideload-zip path has a trust barrier. | Core team | 2026-05-15 |
| How do we support component detection for Vue / Svelte / Solid? (Needs new main-world scripts.) | Core team | 2026-06-30 |
| Do we introduce a "plan-and-execute" mode for multi-step edits within one request? — **Resolved in v0.2.0:** Quick/Discuss mode with `plan_proposal` / `plan_approval` round-trip via FR-30..33. | Core team | 2026-06-30 |
| Do we need telemetry? How do we measure success rate while keeping the zero-upload promise? | Core team | 2026-05-30 |
| Do we support non-Git projects? (Current result flow depends on `git diff`.) — **Resolved in v0.2.0:** snapshot-mode diff via FR-29. | Core team | 2026-05-30 |
| Is Claude's single-shot hit rate on DOM-only (`file://`) requests within the 85% target, or does it need a distinct baseline? | Core team | 2026-06-30 |
| Should we treat detected build artifacts (`dist/`, `build/`, `.next/`) in `--project` as read-only and warn the user? | Core team | 2026-06-30 |

## Dependencies

- **External:**
  - Claude Code CLI installed and logged in (`claude` on PATH) — Claude Agent SDK delegates auth to the local CLI.
  - Bun v1.0+ (auto-fetched by `npx @inspatch/server`).
  - For `file://` support: "Allow access to file URLs" enabled for the Inspatch extension in `chrome://extensions`.
  - Git repository recommended (enables rich `git diff` output); when absent, the server falls back to snapshot-mode diff — no longer a hard requirement.
- **Internal:**
  - `@anthropic-ai/claude-agent-sdk` (upstream API changes must be mirrored).
  - Chrome Manifest V3 surface stability (`chrome.debugger` / side panel API).
  - WXT build pipeline.
- **Cross-team:** none (single- or small-team project today).

## Timeline

| Milestone                 | Target date |
| ------------------------- | ----------- |
| PRD frozen                | 2026-04-20 |
| UI doc complete           | 2026-04-24 |
| Frontend / API doc complete | 2026-04-28 |
| Dev complete (P1 items: FR-08, FR-09, FR-11, FR-13, FR-16, FR-18, FR-27, FR-28, FR-29) | 2026-05-15 |
| QA complete               | 2026-06-10 |
| Launch (0.2.0 release)    | 2026-06-30 |

---

> **Note:** This PRD is inferred from the current codebase, README, and `CLAUDE.md`. Metrics (WAU / download targets) and forward-looking dates are reasonable estimates pending team confirmation.
