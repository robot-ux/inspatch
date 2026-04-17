# Screen: result-detail

<!--
Single-screen spec. Inherits Design System, tokens, principles, and shared
patterns from docs/ui.md. Every token/value below is a reference to ui.md.
-->

## References

- **Base UI doc:** [../ui.md](../ui.md) — design system, tokens, shared patterns
- **PRD:** [../prd.md](../prd.md) — upstream requirements and user stories
- **Related FR(s):** FR-05, FR-07, FR-08, FR-09, FR-13, FR-16
- **User story(ies):** Story 3, Story 4

## Purpose

Show what Claude did: the streamed summary, the list of files modified, and the git diff — with a one-click path back into the editor for each file.

## Entry & Exit

- **Entry points:** rendered below the `ElementCard` inside `side-panel-main` whenever a request is in flight (`processing`) or complete (`changeResult`). Not a separate route — it's the bottom third of the side-panel body.
- **Exit points:** user clears the element, retries, sends a new request, clicks a file to open in the editor, or copies the diff.
- **Primary user:** same engineer as `side-panel-main`, verifying Claude's output.

## Layout

A single card that swaps between three visual variants (in-flight / success / failure) at the same slot. Page archetype: **detail** (single-pane card from `ui-standards.md §3.5`, embedded in the parent screen).

| Region | Content / Components | Notes |
| ------ | -------------------- | ----- |
| Container | `rounded-ip-lg border p-4 space-y-2` | Card surface changes tone per variant (`bg-ip-info-muted` / `bg-ip-success-muted` / `bg-ip-error-muted`) |
| Header row | Optional spinner + status label OR "Failed" label | 13px, semibold |
| Body | One of: operation log OR status message OR streamed markdown OR result summary + file list | 11–12px |
| Files | One line per modified file, monospaced, `--ip-success` | Clickable — triggers `open-in-editor` |
| Diff | `DiffBlock` — line-numbered, colour-coded, `max-h-48 overflow-y-auto`, copy button top-right on hover | Monospaced 11px |
| Footer button | Try Again (failure variant only) | `bg-ip-error` |
| Shimmer overlay | `.animate-shimmer` absolute-inset layer | In-flight variant only |

## Data Shown

| Field | Source | Format | Notes |
| ----- | ------ | ------ | ----- |
| `status`        | `StatusUpdate.status` | enum | Maps to label + colour in `statusLabels` |
| `message`       | `StatusUpdate.message` | string | Shown when no `statusLog` |
| `statusLog`     | accumulated non-terminal status messages | `string[]` | Mono, auto-scrolls, last entry highlighted |
| `streamedText`  | accumulated `status_update.streamText` | markdown | Rendered with project `mdComponents` |
| `summary`       | `ChangeResult.summary` | markdown | Shown on success |
| `filesModified` | `ChangeResult.filesModified` | `string[]` | Each row is a button → `open-in-editor` |
| `diff`          | `ChangeResult.diff` | unified diff text | Rendered line-by-line in `DiffBlock` |
| `error`         | `ChangeResult.error` | string | Shown on failure + branched guidance |

## Actions

| Trigger | Action | Result | Keyboard shortcut |
| ------- | ------ | ------ | ----------------- |
| Click a file path         | `GET /open-in-editor?file=…&line=…&column=…` | Editor opens the file (Cursor / VS Code) | `Enter` when focused |
| Hover the diff block      | Copy button fades in (`opacity-0 → opacity-100`) | Reveal-on-hover | — |
| Click Copy (diff)         | `navigator.clipboard.writeText(diff)` | Button flips to `Copied` for 2s | — |
| Hover the stream block    | Same copy-on-hover affordance | — | — |
| Click Copy (stream)       | `navigator.clipboard.writeText(streamedText)` | `Copied` toggle for 2s | — |
| Click Try Again (failure) | `onRetry()` in side panel | Status + result reset; element card still selected; textarea unlocked | — |

## States

> All 8 canonical states from `references/ui-standards.md §7` are filled. Hover / Active / Focus apply to the primary interactive elements (file-path links + Try Again + Copy). Disabled is n/a with rationale.

| State     | When it shows | What the user sees | Exit condition |
| --------- | ------------- | ------------------ | -------------- |
| **Default**   | Three variants at rest:<br>• **success** — `changeResult.success === true`: success-tinted card, markdown summary, files list (green mono), diff block<br>• **success (no diff)** — same but the `diff` field is empty (Claude produced a summary but no edits)<br>• **queued** — `status === 'queued'`: info card, grey "Queued" label, no spinner yet | Variant-appropriate rendering (see table headers) | User clears / sends again / clicks Try Again |
| **Hover**     | Pointer on file path / Try Again / card edge | File path → underline + brightness shift (150ms); Copy button → `opacity-0 → opacity-100` on card hover; Try Again → `hover:brightness-110 hover:shadow-ip-glow-error` | Pointer leaves |
| **Active**    | Mousedown on file path / Try Again / Copy | `active:scale-95` on Try Again and Copy; file path flashes a darker accent tone briefly | Mouseup |
| **Focus**     | Keyboard focus on any file link, Copy button, or Try Again | Global `*:focus-visible` 2px `--ip-border-accent` ring + `--ip-shadow-glow-accent` | Tab / click elsewhere |
| **Disabled**  | n/a — every button in this card represents an action that's always allowed when visible. File paths are always clickable (the editor jump is idempotent); Try Again is only rendered in failure and always enabled; Copy is always enabled | — | — |
| **Loading**   | In-flight — `status ∈ { analyzing, locating, generating, applying }` | Info-tinted card, spinner (`animate-spin`), status label, operation log, streamed markdown (copy-on-hover), `animate-shimmer` overlay (`pointer-events-none`) | `change_result` received → Default (success) / Error |
| **Empty**     | Before any `status_update` arrives for the current request — `processing` object exists but no message yet | Info card, `Queued` label, no body text, no spinner | First `status_update` arrives → Loading |
| **Error**     | Three failure sub-variants, differentiated by `error` keyword:<br>• **generic failure** — `changeResult.success === false`, error matches no keyword<br>• **timeout** — error contains `timed out`<br>• **cancelled** — error contains `abort` | Error-tinted card, `Failed` label, reason, branched guidance copy, Try Again button | User clicks Try Again (reset to Loading-ready) or Clear (remove card entirely) |

## Copy

| Key / Location | Copy | Notes |
| -------------- | ---- | ----- |
| Status — queued     | `Queued` | `--ip-text-muted` |
| Status — analyzing  | `Analyzing` | `--ip-info` |
| Status — locating   | `Locating files` | `--ip-info` |
| Status — generating | `Generating` | `--ip-text-accent` |
| Status — applying   | `Applying changes` | `#C084FC` (legacy hex — see Open Questions) |
| Status — complete   | `Complete` | `--ip-success` |
| Status — error      | `Error` | `--ip-error` |
| Success headline (no summary) | `Changes applied` | `--ip-success`, 13px semibold |
| Failure headline    | `Failed` | `--ip-error`, 13px semibold |
| Failure guidance · timeout | `Try a simpler change description, or increase the server timeout.` | |
| Failure guidance · abort   | `The request was cancelled. Try again when ready.` | |
| Failure guidance · default | `Check the server terminal for details. You can try again with a different description.` | |
| Copy button · idle    | `Copy` | |
| Copy button · flashed | `Copied` | 2s |
| Retry button          | `Try Again` | |

## Responsive Behavior

Inherits from `side-panel-main` — there is no independent breakpoint story.

| Breakpoint         | Layout adjustments |
| ------------------ | ------------------ |
| Mobile (<768px)    | n/a |
| Tablet (768–1024)  | n/a |
| Desktop (>1024px)  | Diff block `max-h-48` with internal scroll; stream block `max-h-32`; lines wrap `whitespace-pre-wrap` |

## Accessibility

- **Tab order:** file links (in order) → diff copy button (when revealed) → stream copy button → Try Again (failure only).
- **Focus management:** Focus is not moved into the card on completion today (see Open Questions).
- **Keyboard shortcuts:** none specific to this card — Enter always belongs to `ChangeInput` in the parent screen.
- **ARIA labels:** Copy and Try Again are text buttons — no aria needed. File links should eventually expose something like `aria-label="Open {file} at line {n} in {editor}"` (currently uses `title`).
- **Screen reader flow:** Status label reads first (e.g. "Analyzing"), then message, then streamed summary, then files, then diff. No `aria-live` region today; transitions will not be announced automatically.

## Motion & Feedback

- **Enter / exit:** `animate-fade-in-scale` (200ms) on card appearance and on success/failure transitions.
- **State transitions:** Status label colour crossfades 300ms. Shimmer overlay (`animate-shimmer`, 2s linear infinite) sits on the in-flight variant only; it's decorative, `pointer-events-none`.
- **Hover / press feedback:** File path → underline + brightness shift; copy button → opacity 0→1 on card hover. `active:scale-95` on Try Again and Copy.
- **Performance:** Diff rendering is line-by-line React — for very large diffs we cap visual area via `max-h-48 overflow-y-auto`; no virtualization today (see Open Questions).

## Edge Cases

- `filesModified` is empty (Claude produced a summary but no edits) → Default state, "success (no diff)" sub-variant: only summary is shown; no green file rows.
- Very long diff (thousands of lines) → scroll container caps visible area, but render cost is linear. Over ~5k lines the panel can stutter.
- Summary contains code blocks → rendered as `font-code text-[11px]` block with `--ip-bg-primary` fill (see `mdComponents`).
- Error string does not match `timed out` / `abort` keywords → Error state falls through to the `generic failure` sub-variant with default guidance copy.
- Clipboard API blocked (rare in extension context) → `copyToClipboard` fails silently; the "Copied" flash still triggers. (Known bug surface — Open Questions.)
- Claude hits the 1800s runner timeout → Error state, `timeout` sub-variant.
- User closes the panel mid-request then reopens → on reconnect, `resume` replays current state; this card re-enters at the correct variant.

## Analytics / Events

n/a — same zero-upload constraint as the rest of the product.

| Event name | Trigger | Properties |
| ---------- | ------- | ---------- |
| n/a | n/a | n/a |

## Open Questions

- Replace the hardcoded `#C084FC` on the "Applying changes" label with a proper token (`--ip-text-accent-2` or similar)?
- Virtualize the diff block for > 2k-line results?
- Add `aria-live="polite"` to the status card so SR users hear state transitions?
- Confirm clipboard feedback when the underlying API fails (today the flash still fires).

## Out of Scope

- Multi-request comparison (diff between two runs).
- File-tree browsing — the list is flat and comes from `change_result.filesModified` as-is.
- Inline editing inside the diff block.
- Routing to a standalone full-window result view — this card is always embedded in `side-panel-main`.
