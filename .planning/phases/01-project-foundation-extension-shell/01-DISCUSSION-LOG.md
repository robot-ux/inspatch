# Phase 1: Project Foundation & Extension Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 1-Project Foundation & Extension Shell
**Areas discussed:** Monorepo Layout, Extension Entry Points, Shared Schema Design, Side Panel Shell
**Mode:** Auto (all recommended defaults selected)

---

## Monorepo Layout

| Option | Description | Selected |
|--------|-------------|----------|
| packages/extension + packages/server + packages/shared | Standard three-package monorepo | ✓ |
| Single package | Simpler but limits code sharing | |
| packages/extension + packages/server (inline shared) | No dedicated shared package | |

**User's choice:** Three-package monorepo (auto-selected recommended default)
**Notes:** User explicitly chose Bun over pnpm for package management

---

## Extension Entry Points

| Option | Description | Selected |
|--------|-------------|----------|
| Content script + Service worker + Side panel | All three MV3 entry points | ✓ |
| Content script + Side panel only | Simpler but loses background processing | |

**User's choice:** All three entry points (auto-selected recommended default)
**Notes:** openPanelOnActionClick behavior for reliable panel opening per PITFALLS.md CP-6

---

## Shared Schema Design

| Option | Description | Selected |
|--------|-------------|----------|
| Zod discriminated unions with type field | Type-safe, runtime validation | ✓ |
| Plain TypeScript types only | No runtime validation | |
| io-ts or Effect Schema | Alternative validation libraries | |

**User's choice:** Zod discriminated unions (auto-selected recommended default)
**Notes:** Initial types: ConnectionStatus, ElementSelection, ChangeRequest, StatusUpdate, ChangeResult

---

## Side Panel Shell

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal React + Tailwind with status indicator | Lean shell, build on later | ✓ |
| Full component library setup | Overkill for Phase 1 | |

**User's choice:** Minimal shell (auto-selected recommended default)
**Notes:** Connection status + "Select an element to get started" empty state

---

## Claude's Discretion

- ESLint/Prettier config
- tsconfig.json project references
- Tailwind theme
- Test file organization

## Deferred Ideas

None
