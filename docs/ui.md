# UI Doc

<!--
Base UI document for Inspatch. Tokens are extracted verbatim from
packages/extension/entrypoints/sidepanel/style.css — the shipped CSS is
the single source of truth; this doc mirrors it.
Screen detail lives under ./screens/<slug>.md — one file per screen.
-->

## Overview

- **Product / Feature:** Inspatch — Chrome extension side panel + injected inspect overlay for localhost React apps
- **Framework:** React 19 + Tailwind CSS v4 (via `@tailwindcss/vite`), built with WXT (Chrome MV3)
- **Platforms:** Chrome desktop (Chromium ≥ the version WXT targets). No mobile.
- **Designer:** Inspatch core team (design-in-code)
- **Date:** 2026-04-17
- **PRD:** [./prd.md](./prd.md)

## Design System

- **Source:** Inspatch Custom DS — documented from the shipped stylesheet, not a third-party library.
- **Reference:** [`packages/extension/entrypoints/sidepanel/style.css`](../packages/extension/entrypoints/sidepanel/style.css) (authoritative). This doc mirrors its tokens; if the CSS changes, update this doc in the same PR.

**Aesthetic intent:** Dark-first, indigo-accent, glass-card developer tool. The surface should feel like a tight sibling of the editor — quiet chrome, monospaced identifiers, coloured state only on important events (success / error / in-flight). No "SaaS hero" gradients, no rounded-2xl card grids, no decorative illustrations.

**Differentiation:** The indigo gradient `#a3a6ff → #6063ee` is reserved exclusively for the **primary CTAs that launch work** (Start Inspect, Send, Inspect toggle button). Everything else is monochrome. That scarcity is what makes it feel "inspatch".

### Tokens

#### Colors

CSS variables live on `:root`; Tailwind utilities use the `ip-*` prefix via `@theme` mapping (e.g. `bg-ip-bg-primary`, `text-ip-text-accent`, `border-ip-border-subtle`).

| Token | Value | Usage |
| ----- | ----- | ----- |
| `--ip-bg-primary`       | `#0e0e0e`                        | Page background (side panel body, result diff block) |
| `--ip-bg-secondary`     | `#131313`                        | Header bar strip, input footer |
| `--ip-bg-tertiary`      | `#262626`                        | Neutral chips, disabled button fill, scrollbar thumb |
| `--ip-bg-card`          | `rgba(38, 38, 38, 0.6)`          | Glass card surface (element card, result card) |
| `--ip-bg-input`         | `rgba(32, 31, 31, 0.85)`         | Textarea / input background |
| `--ip-border-subtle`    | `rgba(73, 72, 71, 0.10)`         | Default divider (header bottom, card border, input border) |
| `--ip-border-muted`     | `rgba(73, 72, 71, 0.15)`         | Secondary divider, step numerals |
| `--ip-border-accent`    | `rgba(163, 166, 255, 0.40)`      | Focused input border, card hover border |
| `--ip-text-primary`     | `#ededed`                        | Headings, body |
| `--ip-text-secondary`   | `#adaaaa`                        | Body secondary, markdown paragraphs |
| `--ip-text-muted`       | `#6e6d6d`                        | Captions, helper labels, placeholder |
| `--ip-text-accent`      | `#a3a6ff`                        | Inline code, link-like emphasis, selected element `#id` |
| `--ip-gradient-start`   | `#a3a6ff`                        | 135° gradient start — primary CTA only |
| `--ip-gradient-end`     | `#6063ee`                        | 135° gradient end — primary CTA only |
| `--ip-accent-solid`     | `#6063ee`                        | Selection highlight, solid accent flat fills |
| `--ip-success`          | `#c5ffc9`                        | Positive state text (file paths in result, success label) |
| `--ip-success-muted`    | `rgba(197, 255, 201, 0.12)`      | Success card fill |
| `--ip-warning`          | `#c180ff`                        | Warning text (console-error banner, no-source-file note) |
| `--ip-warning-muted`    | `rgba(193, 128, 255, 0.15)`      | Warning card fill |
| `--ip-error`            | `#ff6e84`                        | Destructive state (Stop inspect, failed result, clear button hover) |
| `--ip-error-muted`      | `rgba(255, 110, 132, 0.15)`      | Error card fill |
| `--ip-info`             | `#a3a6ff`                        | In-flight state (analyzing / locating label) |
| `--ip-info-muted`       | `rgba(163, 166, 255, 0.15)`      | Info card fill (processing card) |

Semantic note: `--ip-info` and `--ip-text-accent` share the same hex — intentional. "Accent" and "info" are the same visual language (indigo) on this surface.

#### Spacing

Tailwind defaults (4-pt scale) are used directly. There are no custom `--space-*` tokens. The palette in active use:

| Token | Value | Common usage |
| ----- | ----- | ------------ |
| `p-1` / `gap-1` | 4px  | Icon-to-label gap in dense chips |
| `p-2` / `gap-2` | 8px  | Between inline controls |
| `p-3` / `gap-3` | 12px | Card internal padding (tight), row gap in lists |
| `p-4` / `gap-4` | 16px | Card internal padding (default), main content padding |
| `gap-6`         | 24px | CTA → helper text separation |
| `gap-7`         | 28px | Section separation in landing/empty states |

#### Typography

- **Body sans:** `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` (body default).
- **Monospace:** `--font-code` = `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace`. Used for XPath, class list, source path, component name, diff content, status labels — everything that represents code or identifiers. Tailwind class: `font-code`.

The project does **not** use a display/heading font. This is intentional: Inspatch is a tool, not a brand surface. Every label reads as either "chrome" (sans) or "code" (mono).

| Token | Size / weight | Usage |
| ----- | ------------- | ----- |
| `text-[10px]`          | 10px / 400, 500   | Step numerals, send hint, AI suggestion chip label |
| `text-[11px]`          | 11px / 400, 500   | Connection status, chip labels, metadata (XPath / path / errors) |
| `text-[12px]`          | 12px / 400, 500   | Body secondary, diff/stream markdown paragraphs, helper copy |
| `text-[13px]`          | 13px / 400, 600   | Status headline (Analyzing / Complete), CTA button label, textarea text |
| `text-[16px]`          | 16px / 600        | Selected-element tag name (only) |

No `text-xl` / `text-2xl` — the extension surface never needs a page title.

#### Radius & Shadow

| Token | Value |
| ----- | ----- |
| `--ip-radius-sm` | `6px`  — chips, copy buttons, inline pills, small action buttons |
| `--ip-radius-md` | `8px`  — text input, image thumbnail, modal-ish rows, medium buttons |
| `--ip-radius-lg` | `12px` — cards (element card, result card, status card, CTA button) |
| `--ip-shadow-card`        | `0 8px 24px rgba(0, 0, 0, 0.5)` — default card elevation |
| `--ip-shadow-glow-accent` | `0 0 12px 2px rgba(163, 166, 255, 0.28)` — focus ring + card hover + CTA hover |
| `--ip-shadow-glow-error`  | `0 0 12px 2px rgba(255, 110, 132, 0.28)` — (reserved; no active consumer) |
| `--ip-shadow-glow-success`| `0 0 12px 2px rgba(197, 255, 201, 0.22)` — (reserved; no active consumer) |

#### Motion

Intensity: **3 (Smooth)** per `references/fe-motion.md` — CSS transitions + keyframes; no Framer Motion, no GSAP. Duration cap 300ms for interactive, 2s for infinite loaders.

| Token / keyframe | Value | Usage |
| ---------------- | ----- | ----- |
| `fade-in`            | 250ms ease-out · `opacity 0→1` + `translateY 6→0`   | Error banners, onboarding step list, element card initial reveal on non-first load |
| `fade-in-scale`      | 200ms ease-out · `opacity 0→1` + `scale .95→1`       | Result card appearance, image preview |
| `slide-up`           | 300ms ease-out · `opacity 0→1` + `translateY 12→0`   | Element card (first load), input footer mount |
| `slide-down`         | 200ms ease-out · `opacity 0→1` + `translateY -8→0`   | Transient top error banner |
| `glow-pulse`         | 2s ease-in-out infinite · `box-shadow` red halo     | Active "Stop" inspect button (signals "recording") |
| `shimmer`            | 2s linear infinite · background sweep               | Processing card subtle shimmer overlay while in-flight |
| `status-dot`         | 1.5s ease-in-out infinite · `scale 1→1.4`           | (reserved; current impl uses Tailwind `animate-ping` for connected dot) |
| `spin`               | Tailwind default (`animate-spin`)                    | In-flight spinner in processing card |
| Button press         | 150ms · `active:scale-95`                            | All interactive buttons |
| Duration — hover     | 150–200ms                                           | Colour / border transitions on cards + chips |
| Duration — transition| 300ms                                               | Status label colour crossfade |

**Reduced motion:** the project does not yet gate infinite loops (`shimmer`, `glow-pulse`, `animate-ping`) behind `prefers-reduced-motion`. This is a known gap — see Open Questions.

## Design Principles

1. **Chrome is quiet; code is loud.** Every label that represents source (component name, file path, XPath, diff, status) is monospaced. Everything else is sans. A reviewer should be able to tell at a glance where the tool's surface ends and the user's code begins.
2. **Reserve the gradient.** `#a3a6ff → #6063ee` appears on exactly three things: Start Inspect CTA, Send button (when actionable), and the compact Inspect toggle when idle. If the gradient shows up anywhere else, that's a violation.
3. **State is spelled, not just coloured.** Success / error / warning always pair a colour with a text label and, where it matters, an icon. A screenshot of any state should be unambiguous in greyscale.
4. **Cards are the layout primitive, not sections.** The side panel is a vertical stack of rounded-`lg` cards on a flat `#0e0e0e` background. No hero bars, no banners that span the full width unless they're transient (error / warning strip).
5. **Motion flags state transitions, not decoration.** Every animation must correspond to a state change: mount (`slide-up`/`fade-in`), in-flight (`shimmer`, `spin`), attention (`glow-pulse` on Stop). If you can't name the state, delete the animation.

## Shared Patterns

| Pattern | Purpose | Source |
| ------- | ------- | ------ |
| Card (surface)        | Default container for selected element, result, status, onboarding steps | `sidepanel/components/ElementCard.tsx`, `ProcessingStatus.tsx` — `bg-ip-bg-card rounded-ip-lg border border-ip-border-subtle shadow-ip-card` |
| Primary CTA button    | Indigo-gradient button for the single most important action in context | `sidepanel/App.tsx` (Start Inspect), `ChangeInput.tsx` (Send), `HeaderBar.tsx` (Inspect toggle) — `bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end hover:brightness-110 active:scale-95 shadow-ip-card` |
| Destructive button    | Error-tinted button / icon used only for Stop / Clear / Try Again | `HeaderBar.tsx` Stop state (`animate-glow-pulse`), `ElementCard.tsx` X button, `ProcessingStatus.tsx` Try Again |
| Status chip           | Dot + label pill for connection state | `HeaderBar.tsx` — dot colour token per state (`bg-ip-success` / `bg-ip-warning animate-pulse` / `bg-ip-text-muted`) + optional `animate-ping` halo when connected |
| Input bar (v2)        | Single-row `[attachments] [auto-growing textarea] [Send]`, plus an AI-suggestion chip row underneath, plus a keyboard-hint footer line | `ChangeInput.tsx` — textarea grows 1 → ~160px then scrolls; pasted images become thumbnail chips with `×`; suggestion chips fill the textarea and focus it; Enter sends, ⇧↵ newline |
| Processing card       | In-flight state container with shimmer overlay, spinner, operation log | `ProcessingStatus.tsx` active branch — `bg-ip-info-muted rounded-ip-lg` + `.animate-shimmer` overlay |
| Result card (success) | Final success state with markdown summary, files list, copy-able diff | `ProcessingStatus.tsx` success branch — `bg-ip-success-muted border-[rgba(34,197,94,0.3)]` |
| Result card (failure) | Error state with reason, guidance, Try Again button | `ProcessingStatus.tsx` failure branch — `bg-ip-error-muted border-[rgba(239,68,68,0.3)]` |
| Diff block            | Monospaced, line-numbered, `+` green / `-` red / `@@` info, copy button on hover | `ProcessingStatus.tsx::DiffBlock` |
| Empty state           | Icon + label + hint when the panel is idle after first use | `sidepanel/components/EmptyState.tsx` |
| Onboarding step list  | Numbered 01/02/03 monospaced step rows, staggered `fade-in` | `sidepanel/App.tsx` initial-state block (inlined) |
| Transient banner      | Top / bottom strip with `animate-slide-down` for errors, warnings | `sidepanel/App.tsx` error banner + no-source-file warning + console-error tray |
| Collapsible tray      | Header row + expandable body; used for console errors, parent chain | `sidepanel/App.tsx` console-error tray, `ElementCard.tsx` parent chain |
| Connection guide      | Alternative to empty state when WS is not connected — explains how to start the server | `sidepanel/components/StatusGuide.tsx` |
| Box-model overlay     | DevTools-style margin/border/padding/content layers + info tooltip injected into the page | `packages/extension/entrypoints/content/overlay-manager.ts` — margin `rgba(255,155,0,.3)`, border `rgba(255,200,50,.3)`, padding `rgba(120,200,80,.3)`, content `rgba(100,150,255,.3)`, tooltip `#232327` |

Unused / not applicable: **Modal** (no blocking dialogs — all feedback is inline), **Toast** (feedback lives in the processing card or transient banner), **Skeleton** (in-flight is a shimmer + spinner, not skeleton rows), **Navigation** (single-view surface — no routing).

## Information Architecture

```
<Chrome Extension — Inspatch>
├── <Side Panel (chrome.sidePanel)>
│   ├── <HeaderBar>                 # inspect toggle (compact) · connection chip
│   ├── <Body> (one of)
│   │   ├── <NotLocalhost>          # non-localhost tab
│   │   ├── <StatusGuide>           # disconnected / reconnecting
│   │   ├── <OnboardingSteps + CTA> # connected, first run
│   │   ├── <EmptyState: inspecting>
│   │   ├── <EmptyState: idle>      # after first run, no selection
│   │   └── <ElementCard + (ProcessingStatus | ResultCard)?>
│   ├── <ConsoleErrorTray?>         # bottom, when errors buffered
│   └── <ChangeInput>               # bottom, after element selected
└── <Inspected Page — overlay injected by content script>
    └── <BoxModelOverlay>           # margin · border · padding · content layers + tooltip
```

Non-UI surfaces (not in the side-panel IA):

- `GET /health` — server heartbeat, consumed by `useWebSocket`'s reconnect logic.
- `GET /open-in-editor` — clicked file path → editor jump (`ElementCard` calls this directly).
- `ws://127.0.0.1:9377` — duplex channel for `change_request` / `status_update` / `change_result` / `resume_request` / `resume_not_found`.

## Screens Index

Screen detail lives per file under `docs/screens/`. Each screen file inherits tokens, patterns, and principles from this base doc — never redefines them.

| Screen | Purpose | Primary user | Detail |
| ------ | ------- | ------------ | ------ |
| side-panel-main | Connection, Inspect entry, element summary, description input, result / status | Frontend engineer on localhost | → [./screens/side-panel-main.md](./screens/side-panel-main.md) |
| non-localhost-blocked | Blocked state shown when the active tab isn't a supported localhost URL; includes a first-time `welcome` variant | Same user, on the wrong tab (or first-time opener) | → [./screens/non-localhost-blocked.md](./screens/non-localhost-blocked.md) |
| inspect-overlay | In-page targeting layer injected into the localhost tab | Same user, during targeting | → [./screens/inspect-overlay.md](./screens/inspect-overlay.md) |
| result-detail   | Result portion of the side panel after Claude finishes (status card → result card) | Same user, post-change | → [./screens/result-detail.md](./screens/result-detail.md) |

## Accessibility Baseline

- **Color contrast:** all body text pairs (e.g. `#ededed` on `#0e0e0e` → 15.9:1; `#adaaaa` on `#0e0e0e` → 8.9:1) clear WCAG AA; muted helper copy `#6e6d6d` on `#0e0e0e` is 4.5:1 at 11–12px — at the AA boundary; treat it as helper-only, never primary information.
- **Keyboard:** every interactive element reachable with Tab. Global `*:focus-visible` rule paints a 2px `--ip-border-accent` ring plus `--ip-shadow-glow-accent`. Enter sends in `ChangeInput`; ⇧↵ inserts newline.
- **Focus management:** no modals — focus never needs trapping. On result card appearance, focus is **not** moved (known gap — see Open Questions).
- **Motion:** `prefers-reduced-motion` is **not** currently gated on infinite loops (`shimmer`, `glow-pulse`, `animate-ping`, `animate-spin`) — tracked in Open Questions.
- **Screen reader:** connection chip uses both colour and text ("Connected" / "Reconnecting…" / "Disconnected"). Status card always renders a text label ("Analyzing", "Generating", "Complete"…). Stop / Send / Clear buttons expose `title` attributes; moving to formal `aria-label` is an Open Question.
- **Touch targets:** not targeted — Chrome side panel is desktop-only. Density is tight by design (28–36px targets).
- **Color alone:** never used. Status is always label + icon + colour; diff lines are colour + `+` / `-` / `@@` prefix.

## Open Questions

- **Reduced motion:** gate `animate-shimmer`, `animate-glow-pulse`, `animate-ping`, `animate-spin` on `prefers-reduced-motion: reduce`.
- **ARIA:** migrate icon-only buttons from `title` to `aria-label`; add `aria-live="polite"` on the status card.
- **Tokenize legacy colour:** `#C084FC` (used in "Applying changes" label and component-name text in `ElementCard`) is not defined in `:root`; promote to a token.
- **Focus on completion:** decide whether to move focus to the result card when it appears, or rely on SR announcements only.
- **Large diff rendering:** virtualization threshold, if any.

## Out of Scope

- Light mode / theming.
- Internationalization — copy is hardcoded English today.
- Mobile or tablet layouts — Chrome side panel is desktop-only.
- Branding surfaces (logo pages, marketing) — this doc covers the tool's working surface only.
