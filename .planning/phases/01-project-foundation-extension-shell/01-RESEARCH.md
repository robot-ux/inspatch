# Phase 1 Research: Project Foundation & Extension Shell

**Phase:** 1  
**Researched:** 2026-04-14  
**Domain:** Bun monorepo + WXT MV3 extension shell + shared Zod protocol  
**Confidence:** HIGH (official Chrome/WXT/Bun/Tailwind/Zod docs + npm registry; MEDIUM for “every Vite plugin edge case” with WXT)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked decisions (`## Implementation Decisions`)

**Monorepo layout**

- **D-01:** Use Bun workspaces with three packages: `packages/extension`, `packages/server`, `packages/shared`
- **D-02:** `packages/shared` exports Zod schemas and TypeScript types consumed by both extension and server
- **D-03:** Root `package.json` has workspace-level scripts: `dev`, `build`, `test`, `lint`

**Extension entry points**

- **D-04:** WXT entry points: content script (`entrypoints/content.ts`), service worker (`entrypoints/background.ts`), side panel (`entrypoints/sidepanel/`)
- **D-05:** Manifest V3 with minimal permissions: `activeTab`, `sidePanel`, `scripting`; host permissions for `http://localhost:*/*`
- **D-06:** Use `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` for reliable panel opening

**Shared schema design**

- **D-07:** Initial Zod message types: `ConnectionStatus`, `ElementSelection`, `ChangeRequest`, `StatusUpdate`, `ChangeResult`
- **D-08:** All messages use discriminated unions with a `type` field for type-safe routing
- **D-09:** Schemas exported as both Zod objects and inferred TypeScript types

**Side panel shell**

- **D-10:** Side panel renders React 19 + Tailwind CSS 4 with a minimal "connected/disconnected" status indicator
- **D-11:** Side panel shows "Select an element to get started" as initial empty state

### Claude's discretion (`### Claude's Discretion`)

- ESLint/Prettier configuration details
- TypeScript `tsconfig.json` project references setup
- Exact Tailwind theme configuration
- Test file organization within each package

### Deferred ideas (`## Deferred Ideas`)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase requirements

| ID | Description (from REQUIREMENTS.md) | Research support |
|----|-----------------------------------|-------------------|
| INFRA-01 | Bun workspace monorepo (`packages/extension`, `packages/server`, `packages/shared`) | Bun workspaces + `workspace:*` protocol [CITED: https://bun.sh/docs/install/workspaces] |
| INFRA-02 | Shared package: Zod schemas + TS types for all message protocols | `z.discriminatedUnion` on discriminator `type` + `z.infer` [CITED: https://v4.zod.dev/api] |
| INFRA-03 | Extension built with WXT (MV3, Vite-based) | WXT install (`bunx wxt@latest init` / `bun add -D wxt`), entrypoint naming, `wxt.config.ts` Vite hook [CITED: https://wxt.dev/guide/installation], [CITED: https://wxt.dev/guide/essentials/entrypoints.html], [CITED: https://wxt.dev/guide/essentials/config/vite] |
| INFRA-04 | Tests use `bun:test` across all packages | `bun test` discovery, `bun:test` API [CITED: https://bun.sh/docs/test] |
| SIDE-06 | Side panel opens reliably via extension icon (`openPanelOnActionClick`) | `chrome.sidePanel.setPanelBehavior` + manifest `action` [CITED: https://developer.chrome.com/docs/extensions/reference/api/sidePanel] |
</phase_requirements>

## Project constraints (from `.cursor/rules/`)

No `.cursor/rules/` directory in this repo — no additional workspace rules beyond `CLAUDE.md` / planning artifacts.

## Key findings

1. **Bun + WXT is a first-class documented path.** WXT’s installation guide lists Bun alongside pnpm/npm/yarn (`bunx wxt@latest init`, `bun add -D wxt`, `bun run dev`) [CITED: https://wxt.dev/guide/installation]. Bun workspaces match the locked three-package layout (`workspaces: ["packages/*"]`, `workspace:*` deps) [CITED: https://bun.sh/docs/install/workspaces].

2. **Side panel entry naming must follow WXT’s patterns.** Valid layouts include `entrypoints/sidepanel/index.html` (directory) or `entrypoints/sidepanel.html` [CITED: https://wxt.dev/guide/essentials/entrypoints.html]. CONTEXT’s `entrypoints/sidepanel/` matches the documented **Side Panel** table (`sidepanel/index.html` → `/sidepanel.html`).

3. **`openPanelOnActionClick` is the Chrome-supported way to tie the toolbar action to the side panel** without relying on `chrome.sidePanel.open()` gesture timing. Chrome’s docs: declare `action` in the manifest, then call `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` (typically from the service worker on install or startup) [CITED: https://developer.chrome.com/docs/extensions/reference/api/sidePanel]. This aligns with CP-6 mitigation in `.planning/research/PITFALLS.md` (gesture window for `open()` is fragile).

4. **Tailwind v4 in a Vite-backed project:** install `tailwindcss` + `@tailwindcss/vite`, add the Vite plugin, and `@import "tailwindcss";` in CSS [CITED: https://tailwindcss.com/docs/installation/using-vite]. WXT exposes Vite customization via `defineConfig({ vite: () => ({ plugins: [...] }) })` [CITED: https://wxt.dev/guide/essentials/config/vite].

5. **Zod v4 discriminated unions:** use `z.discriminatedUnion("type", [ z.object({ type: z.literal("..."), ... }), ... ])` for efficient parsing vs naive unions; infer TS with `z.infer<typeof Schema>` [CITED: https://v4.zod.dev/api].

6. **`bun:test` works for packages independently;** patterns are `*.test.ts` / `*.spec.ts`, `import { test, expect } from "bun:test"`, run via `bun test` [CITED: https://bun.sh/docs/test]. Extension UI and `chrome.*` APIs need mocks or thin modules — pure schema tests belong in `packages/shared` with fastest feedback.

7. **WXT background caveat:** background modules are imported in Node during build — **no runtime code outside `main()`** [CITED: https://wxt.dev/guide/essentials/entrypoints.html]. Same rule for content scripts.

8. **Registry versions (2026-04-14):** `wxt@0.20.21` is current latest on npm [VERIFIED: npm registry]; CONTEXT locks **0.20.20** — pin exactly in `package.json` unless the team explicitly bumps the locked version. `zod@4.3.6`, `react@19.2.5`, `tailwindcss@4.2.2`, `@tailwindcss/vite@4.2.2` [VERIFIED: npm registry].

## Implementation approach

1. **Scaffold monorepo:** root `package.json` with `"workspaces": ["packages/*"]`, scripts `dev` / `build` / `test` / `lint` delegating to packages (e.g. `bun run --filter extension dev`, or `cd packages/extension && bun run dev` during early phase). Each package: own `package.json`, `tsconfig.json`. Extension depends on `shared` via `"@inspatch/shared": "workspace:*"` (exact package name is planner’s choice).

2. **Extension package:** Initialize with WXT + React template or manual WXT setup per docs [CITED: https://wxt.dev/guide/installation]. Add `entrypoints/background.ts`, `entrypoints/content.ts`, `entrypoints/sidepanel/index.html` (+ React mount). In `background` `main()`, call `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` and `.catch(console.error)` as in Chrome samples [CITED: https://developer.chrome.com/docs/extensions/reference/api/sidePanel]. Ensure manifest includes `action` (title/icon) so the behavior is meaningful.

3. **Manifest / permissions:** Honor D-05: `permissions`: `activeTab`, `sidePanel`, `scripting`; `host_permissions`: `http://localhost:*/*`. Add `side_panel.default_path` pointing at the built side panel HTML (WXT should emit this when the sidepanel entrypoint exists) [CITED: https://developer.chrome.com/docs/extensions/reference/api/sidePanel]. Consider `http://127.0.0.1:*/*` in a later hardening pass if real dev servers bind 127.0.0.1 only — not in CONTEXT; flag as open question.

4. **Tailwind 4:** Add `@tailwindcss/vite` via `wxt.config.ts` → `vite: () => ({ plugins: [tailwindcss()] })` [CITED: https://wxt.dev/guide/essentials/config/vite] + [CITED: https://tailwindcss.com/docs/installation/using-vite]. Import Tailwind in side panel CSS entry (e.g. `assets/style.css` included from side panel HTML/TS).

5. **Shared schemas:** Implement `packages/shared` with one exported `MessageSchema = z.discriminatedUnion("type", [...])` covering D-07 shapes; export `type Message = z.infer<typeof MessageSchema>` and `parseMessage(json: unknown)` using `.safeParse()` for boundary validation (extension ↔ server later).

6. **Testing:** Root `test` runs `bun test` at root with workspaces (or per-package `bun test`). Phase 1: at minimum unit tests for shared Zod parse success/failure; optional smoke test that WXT build outputs expected files [CITED: https://bun.sh/docs/test].

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| **`chrome.sidePanel.open()` gesture failures** when a future feature chains async work before opening | Prefer `setPanelBehavior({ openPanelOnActionClick: true })` for icon-open (SIDE-06); document CP-6 from `PITFALLS.md` for any programmatic `open()` [CITED: Chrome sidePanel docs]. |
| **WXT + nonstandard Vite plugins** behaving differently in dev vs prod | Follow WXT’s `configEnv.mode` pattern for prod-only plugins [CITED: https://wxt.dev/guide/essentials/config/vite]. |
| **Background/content “top-level runtime”** breaking build | Keep listeners/registrations inside `main()` per WXT entrypoint rules [CITED: https://wxt.dev/guide/essentials/entrypoints.html]. |
| **`bun:test` vs Chrome APIs** — tests cannot hit real `chrome.*` without harness | Keep Phase 1 tests focused on `shared` + pure utilities; introduce typed `chrome` mocks later if needed [ASSUMED: common extension testing practice]. |
| **STACK.md still mentions pnpm** in places | Execution must follow CONTEXT (Bun only); treat STACK.md pnpm snippets as superseded for install commands. |

## Dependencies

| Package / tool | Version note | Role |
|----------------|--------------|------|
| **Bun** | 1.3.12 in environment [VERIFIED: local `bun --version`] | Workspaces, install, `bun:test`, script runner |
| **wxt** | Pin **0.20.20** per CONTEXT; npm `latest` is 0.20.21 [VERIFIED: npm registry] | Extension build/dev/zip |
| **react** / **react-dom** | 19.x (registry 19.2.5) [VERIFIED: npm registry] | Side panel UI |
| **tailwindcss** + **@tailwindcss/vite** | 4.2.x [VERIFIED: npm registry] | Side panel styling |
| **zod** | 4.3.6 [VERIFIED: npm registry] | Shared message schemas |
| **typescript** | 5.7+ per STACK [CITED: `.planning/research/STACK.md`] | All packages |
| **Chrome** | Side Panel API **114+**; `sidePanel.open()` **116+** [CITED: https://developer.chrome.com/docs/extensions/reference/api/sidePanel] | Target browser for development |

**Installation shape (illustrative — exact names per planner):**

```bash
# In repo root after package.json workspaces exist
bun install
cd packages/extension && bun add -D wxt && bun add react react-dom zod && bun add -D typescript @types/react @types/react-dom tailwindcss @tailwindcss/vite
```

## Open questions

1. **Exact npm scope / package names** (`@inspatch/shared` vs `inspatch-shared`) — not locked in CONTEXT; pick once for imports and TS path aliases.
2. **`127.0.0.1` vs `localhost` host permissions** — CONTEXT only lists `http://localhost:*/*`. Some stacks bind `127.0.0.1` only; confirm whether to extend host permissions in Phase 1 or defer [ASSUMED: may be environment-dependent].
3. **WXT 0.20.20 vs 0.20.21** — registry moved patch; stay pinned to 0.20.20 unless maintainers want patch fixes without a CONTEXT amendment.
4. **Root `dev` orchestration** — whether one command runs extension dev only or extension + future server; Phase 1 may only need `packages/extension` dev.

## Validation architecture

`.planning/config.json` has `workflow.nyquist_validation: true` (not false).

| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) [CITED: https://bun.sh/docs/test] |
| Config file | None required initially; optional `bunfig.toml` [CITED: https://bun.sh/docs/test] |
| Quick run | `bun test` (root or per-package) |
| Full suite | Same until multiple packages have tests |

**Phase requirements → tests (Phase 1)**

| Req ID | Suggested test | Automated command | Status |
|--------|----------------|-------------------|--------|
| INFRA-02 | `MessageSchema.safeParse` accepts/rejects representative payloads | `bun test ./packages/shared/...` | Wave 0 — add file |
| INFRA-04 | At least one `bun:test` per package or documented exemption | `bun test` | Wave 0 — no tests in repo yet |
| SIDE-06 | Manual: load unpacked extension, click action icon, panel opens | Manual | Expected for UI gesture |

**Wave 0 gaps:** No `package.json` / test files yet — add `packages/shared/src/**/*.test.ts` and root script `bun test` before claiming INFRA-04 done.

## Security domain (Phase 1 scope)

| ASVS area | Applies | Note |
|-----------|---------|------|
| V5 Input validation | Yes | All JSON messages should pass through Zod at boundaries (foundation: shared schemas only) [CITED: https://v4.zod.dev/api] |
| V2/V3/V4 | Minimal | Local-only tool; no remote auth in Phase 1 |

**Threat pattern:** Forged `postMessage` / extension messages in later phases — plan for origin/channel validation; Phase 1 only establishes schema shapes.

## Sources

### Primary (HIGH)

- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) — permissions, `setPanelBehavior`, `openPanelOnActionClick`, manifest `side_panel.default_path`
- [WXT Installation](https://wxt.dev/guide/installation) — Bun commands
- [WXT Entrypoints](https://wxt.dev/guide/essentials/entrypoints.html) — background, content, sidepanel naming, `main()` constraint
- [WXT Vite config](https://wxt.dev/guide/essentials/config/vite) — `vite: () => ({ plugins })`
- [Bun Workspaces](https://bun.sh/docs/install/workspaces) — monorepo layout
- [Bun Test runner](https://bun.sh/docs/test) — `bun:test`, discovery, CI
- [Tailwind CSS v4 + Vite](https://tailwindcss.com/docs/installation/using-vite) — `@tailwindcss/vite`, `@import "tailwindcss"`
- [Zod v4 API](https://v4.zod.dev/api) — `z.discriminatedUnion`
- [VERIFIED: npm registry] — `npm view wxt|zod|react|tailwindcss|@tailwindcss/vite version` on 2026-04-14

### Secondary

- `.planning/research/PITFALLS.md` — CP-1, CP-6 (side panel gesture)
- `.planning/research/ARCHITECTURE.md` — messaging patterns (supplement; package layout differs slightly from CONTEXT’s `entrypoints/` convention)

## Assumptions log

| # | Claim | Risk if wrong |
|---|--------|----------------|
| A1 | Extension unit tests in Phase 1 focus on `shared` + pure TS; minimal/no `chrome.*` in automated tests | Test plan mismatch if team expects full UI automation in Phase 1 |

## Metadata

**Valid until:** ~2026-05-14 (re-check WXT/npm minors monthly)  
**Environment probe:** `bun` 1.3.12, `node` v24.14.1 present [VERIFIED: local shell]; Chrome version not probed — developers need Chrome ≥114 for side panel, ≥116 if using `open()` [CITED: Chrome docs].
