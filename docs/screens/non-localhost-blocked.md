# Screen: non-localhost-blocked

<!--
Single-screen spec. Inherits Design System, tokens, principles, and shared
patterns from docs/ui.md. Every token/value below is a reference to ui.md.
-->

## References

- **Base UI doc:** [../ui.md](../ui.md) — design system, tokens, shared patterns
- **PRD:** [../prd.md](../prd.md) — upstream requirements and user stories
- **Related FR(s):** FR-21, FR-24
- **User story(ies):** Story 6

## Purpose

When the active Chrome tab is neither a supported localhost URL nor a local `file://` HTML page, tell the user why Inspatch can't do anything here and how to get unblocked — without pretending the server is down or the onboarding hasn't been completed. First-time users (no `lastLocalhostUrl` yet) additionally see a `welcome` lede so the very first impression isn't a raw error surface.

## Entry & Exit

- **Entry points:** user opens the side panel on a tab whose URL is neither (a) an http(s) URL with host `localhost` / `127.0.0.1` / `*.local` nor (b) a `file://` URL; or the user switches to such a tab while the panel is open. Note: `file://` pages are **not** blocked — they render the normal `side-panel-main` surface (see FR-24).
- **Exit points:** user switches to a supported tab — localhost dev server or `file://` HTML (panel flips back to `side-panel-main`); user clicks the primary `Open localhost:3000` action (opens the last-known localhost URL or a sensible default); user clicks the docs link (external page).
- **Primary user:** same frontend engineer as `side-panel-main`, on the wrong tab — or opening Inspatch for the first time on a non-localhost page.

## Layout

Vertical stack in the side-panel body; the header stays but its connection chip is rendered in a neutral `—` state. Page archetype: **detail** (single-column informational surface from `ui-standards.md §3.5`).

| Region | Content / Components | Notes |
| ------ | -------------------- | ----- |
| Header (h-10)   | `HeaderBar` — (compact Inspect toggle disabled) · flex spacer · neutral `—` connection chip | Chip uses grey dot, no halo, `title="Not applicable on this tab"` |
| Welcome lede (first-time only) | Small Inspatch wordmark + `What is Inspatch?` title + 1–2 sentences | Only when `lastLocalhostUrl` is absent; `text-[13px] font-semibold` + `text-[12px] text-ip-text-muted` |
| Logo + lede    | Small Inspatch logo + heading + one-line explanation | `text-[13px] font-semibold` / `text-[12px] text-ip-text-muted` |
| Blocked card   | Icon (`globe-lock` / `link-2-off`) + title + current URL (mono, truncated with `title` tooltip) + body copy | `bg-ip-warning-muted border-[--ip-border-muted] rounded-ip-lg p-4` |
| Primary action | `Open localhost:3000` button (or last-known localhost URL, read from `chrome.storage.local`) | Gradient CTA — reuses the `Primary CTA button` pattern |
| Secondary link | `See docs` — opens `https://github.com/…/inspatch#supported-urls` | `text-[11px] text-ip-text-accent underline-offset-2` |
| Why explainer  | Collapsible `Why?` row that expands into 2–3 bullet points on host-permission model + `localhost` scope | `rounded-ip-md bg-ip-bg-card` |

## Data Shown

| Field | Source | Format | Notes |
| ----- | ------ | ------ | ----- |
| `activeTabUrl`  | `chrome.tabs.query({ active: true, currentWindow: true })` | `URL` string | Host extracted + rendered mono |
| `lastLocalhostUrl` | `chrome.storage.local['lastLocalhostUrl']` | `URL` string or `undefined` | Absent → triggers the `welcome` variant + static fallback CTA |
| `hasOpenedBefore` | `chrome.storage.local['hasOpenedBefore']` | boolean | Drives whether the welcome lede renders (first-time on this tab) |

## Actions

| Trigger | Action | Result | Keyboard shortcut |
| ------- | ------ | ------ | ----------------- |
| Click `Open localhost:3000` | `chrome.tabs.update({ url: lastLocalhostUrl ?? 'http://localhost:3000' })` | Active tab navigates to localhost; side panel re-evaluates and flips to `side-panel-main` | `Enter` when CTA has focus |
| Click `See docs`            | `chrome.tabs.create({ url: DOCS_URL })` | Docs open in a new tab | — |
| Click `Why?`                | Toggles the explainer open/closed | Panel height grows by ~60px with 200ms ease-out | — |

## States

> All 8 canonical states from `references/ui-standards.md §7` are filled. Hover / Active / Focus / Disabled apply to the primary `Open localhost:3000` CTA (the single interactive focal point). Empty is the screen's own `welcome (first-run)` variant — the first-time-user entry surface.

| State     | When it shows | What the user sees | Exit condition |
| --------- | ------------- | ------------------ | -------------- |
| **Default**   | `activeTabUrl` is an http(s) URL with host ∉ { localhost, 127.0.0.1, *.local } AND `lastLocalhostUrl` is known. `file://` URLs never reach this state (see FR-24) | Blocked card with icon + title + current URL (mono) + primary CTA showing the remembered URL host + secondary `See docs` + collapsed `Why?` | User switches tab → `side-panel-main`; or clicks CTA → tab navigates |
| **Hover**     | Pointer on any card / button / link | Primary CTA: `hover:brightness-110 hover:shadow-ip-glow-accent` (200ms); `See docs`: colour shifts `--ip-text-accent` → lighter; `Why?` toggle: underline | Pointer leaves |
| **Active**    | Mousedown on primary CTA or `See docs` | `active:scale-95` on CTA (150ms); link flashes pressed tone | Mouseup |
| **Focus**     | Keyboard focus on Primary CTA / secondary link / Why toggle | Global `*:focus-visible` 2px `--ip-border-accent` ring + `--ip-shadow-glow-accent` | Tab / click elsewhere |
| **Disabled**  | `chrome.tabs` permission missing (install-time gate — unlikely in practice) | Primary CTA replaced by a non-clickable informational card; copy becomes `Open a localhost tab to start inspecting`; `See docs` still clickable | User grants permission and reloads |
| **Loading**   | Moment between clicking the primary CTA and Chrome actually navigating the tab (sub-100ms typical) | CTA button briefly shows `opacity-70 pointer-events-none`; no spinner because navigation is fast | Tab navigates; panel flips to `side-panel-main` |
| **Empty**     | **welcome variant** — first time the side panel is ever opened (no `lastLocalhostUrl`, no `hasOpenedBefore`) AND the tab is http(s) non-localhost | Welcome lede above the blocked card: `Welcome to Inspatch` + one-line pitch; primary CTA falls back to static `Open http://localhost:3000`; `Why?` auto-expands on this variant to teach context | User opens a localhost tab or a `file://` HTML page for the first time (writes both storage keys) |
| **Error**     | Remembered localhost URL no longer resolves (e.g. dev server stopped) — tab navigates and Chrome shows its own error page | Side panel still reads "non-localhost" and stays on this screen; blocked card gains a helper line `Last-used URL {host} didn't respond — start your dev server and retry` | User starts dev server and navigates manually, OR switches to a working localhost tab |

## Copy

| Key / Location | Copy | Notes |
| -------------- | ---- | ----- |
| Welcome lede · title        | `Welcome to Inspatch` | `text-[13px] font-semibold --ip-text-primary`; only in Empty state |
| Welcome lede · body         | `Click any element on your localhost dev server, describe the change, and Claude edits your code — without leaving the browser.` | `text-[12px] --ip-text-muted` |
| Heading                     | `Inspatch works on local pages only` | `text-[13px] font-semibold --ip-text-primary`; "local" covers localhost dev servers and `file://` HTML files |
| Subheading                  | `Navigate to your local dev server — or open a local HTML file — to start inspecting` | `text-[12px] --ip-text-muted` |
| Current URL label           | `Current tab` | `text-[10px] --ip-text-muted tracking-wider` |
| Primary CTA                 | `Open localhost:3000` (or remembered URL host) | Gradient CTA |
| Secondary                   | `See docs` | Underlined link |
| Why toggle                  | `Why?` | `text-[11px] --ip-text-accent` |
| Why expanded                | `Inspatch edits source files on your machine. It attaches to tabs served from localhost or opened as local HTML files because that's where your source lives. Remote / production sites have no local source to edit.` | 2–3 short lines |
| Error helper (last URL dead) | `Last-used URL {host} didn't respond — start your dev server and retry.` | `text-[11px] --ip-text-muted` |
| Disabled fallback           | `Open a localhost tab to start inspecting` | Shown instead of the CTA when `chrome.tabs` permission is missing |

## Responsive Behavior

Inherits the parent side-panel width range. No breakpoint logic; all text wraps.

| Breakpoint         | Layout adjustments |
| ------------------ | ------------------ |
| Mobile (<768px)    | n/a — Chrome side panel is desktop-only |
| Tablet (768–1024)  | n/a |
| Desktop (>1024px)  | Single-column fluid; current-URL pill truncates with `title` tooltip |

## Accessibility

- **Tab order:** Inspect toggle (disabled) → Connection chip → Primary CTA → Secondary link → Why toggle.
- **Focus management:** On entering this state, focus is not moved automatically (consistent with the rest of the panel). In the `welcome` variant the first-time heading lives above the CTA, so SR users hear the intro before the blocked card.
- **Keyboard shortcuts:** none specific.
- **ARIA labels:** Primary CTA `aria-label="Open last-used localhost URL"`; secondary link `aria-label="Open Inspatch supported-URLs docs"`.
- **Screen reader flow:** (welcome variant only) welcome title → welcome body → heading → subheading → current URL → primary CTA → docs link → explainer. (default) heading → subheading → current URL → primary CTA → docs link → explainer.

## Motion & Feedback

- **Enter / exit:** Blocked card uses `animate-fade-in` (250ms) on mount; the welcome lede fades in 60ms earlier than the card so the order is: lede → card → CTA; the Why explainer toggles with a 200ms height animation.
- **State transitions:** Connection chip crossfades to neutral when the tab flips; no other transitions unique to this screen.
- **Hover / press feedback:** Primary CTA uses the default gradient hover (`hover:brightness-110 hover:shadow-ip-glow-accent`). `Why?` toggle uses `text-ip-text-accent` hover.

## Edge Cases

- `chrome.tabs` permission missing → Disabled state (fallback copy, no primary CTA).
- Active tab is `chrome://` or `about:` page → treat as blocked; same state applies.
- Active tab is `file://` → **not** blocked; the side panel renders `side-panel-main` instead (see FR-24). This screen is never shown for `file://`.
- Remembered localhost URL no longer resolves → tab navigates and fails; Chrome's own error page handles it — side panel still shows blocked until user navigates to a working URL. See Error state.
- User has the side panel pinned across many tabs and rapidly switches → blocked state toggles per-tab; no flicker because the body swap uses `animate-fade-in`, 250ms.
- First-time install on a non-localhost tab → Empty (welcome) state; once the user opens any localhost tab, `hasOpenedBefore` is set and future returns use the Default state (no welcome lede).

## Analytics / Events

n/a — zero-upload promise.

| Event name | Trigger | Properties |
| ---------- | ------- | ---------- |
| n/a | n/a | n/a |

## Open Questions

- Should the primary CTA try to detect the project's actual dev-server port (scan `3000 / 5173 / 8080 / 4321`) instead of hardcoding `localhost:3000`?
- Should we allow the user to whitelist additional hosts (e.g. a LAN IP for mobile testing) directly from this screen?
- Should this screen offer a "copy command" shortcut that writes `npx @inspatch/server -p ./path` to the clipboard in case the server also isn't running?
- Should the welcome lede be a separate standalone screen instead of an Empty-state variant here? (Current choice: keep here to avoid a 5th screen for one-time content.)

## Out of Scope

- Remote / cloud dev environments (Codespaces, Gitpod) — out of current product scope.
- Configuring host permissions — Chrome's own extension settings own this.
- A full first-run tour with screenshots — the welcome lede is 1–2 lines, not a tutorial.
