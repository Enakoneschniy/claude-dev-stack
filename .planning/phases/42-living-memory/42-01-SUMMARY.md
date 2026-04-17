---
phase: 42-living-memory
plan: "01"
subsystem: vault/memory
tags: [sqlite, sessions, memory, hook, cli]
dependency_graph:
  requires:
    - "packages/cds-core/src/vault/sessions.ts (SessionsDB interface)"
  provides:
    - "SessionsDB.listSessions + countObservationsByType + countEntities + topEntities + getSessionObservationCount"
    - "packages/cds-cli/src/memory.ts (formatMemorySummary + main)"
    - "hooks/session-start-context.sh SQLite memory injection block"
  affects:
    - "packages/cds-cli/src/memory.ts"
    - "hooks/session-start-context.sh"
    - "bin/cli.mjs"
    - "tsup.config.ts"
tech_stack:
  added: []
  patterns:
    - "vi.hoisted + vi.mock for @cds/core in cds-cli tests"
    - "Fail-silent main() pattern: errors to stderr, output to stdout only"
    - "SessionStart hook: MEMORY_OUT=$(node ... 2>/dev/null) + if [ -n ] guard"
key_files:
  created:
    - packages/cds-cli/src/memory.ts
    - packages/cds-cli/src/memory.test.ts
  modified:
    - packages/cds-core/src/vault/sessions.ts
    - tsup.config.ts
    - bin/cli.mjs
    - hooks/session-start-context.sh
decisions:
  - "Used session summary as topic fallback instead of searchObservations('*') to avoid FTS5 MATCH syntax error with bare wildcard"
  - "topEntitiesStmt uses simple GROUP BY name (no junction table) matching actual schema"
metrics:
  duration: "~25 min"
  completed: "2026-04-17"
  tasks_completed: 2
  files_changed: 6
---

# Phase 42 Plan 01: Living Memory Foundation Summary

**One-liner:** Extended SessionsDB with five list/count query methods and implemented the `memory` CLI command that injects a condensed SQLite session summary into Claude's context at session start via the SessionStart hook.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Extend SessionsDB | bc1c45f | packages/cds-core/src/vault/sessions.ts |
| 2 | memory.ts + hook wiring | 94d38bb | packages/cds-cli/src/memory.ts, memory.test.ts, tsup.config.ts, bin/cli.mjs, hooks/session-start-context.sh |

## What Was Built

### Task 1: SessionsDB Extensions

Added five methods to the `SessionsDB` interface and corresponding prepared statements + handle implementations in `buildSessionsHandle()`:

- **`listSessions(options?)`** — `SELECT ... ORDER BY start_time DESC LIMIT N`, with optional project filter (D-146)
- **`countObservationsByType()`** — `GROUP BY type ORDER BY count DESC` (D-145)
- **`countEntities()`** — `SELECT COUNT(*) FROM entities` (D-145)
- **`topEntities(limit?)`** — `GROUP BY name ORDER BY count DESC LIMIT N` (D-145)
- **`getSessionObservationCount(sessionId)`** — `COUNT(*) WHERE session_id = ?` (D-140)

### Task 2: memory CLI Command

Created `packages/cds-cli/src/memory.ts` implementing `formatMemorySummary` and `main`:

- Output format per D-140: `Session DATE: [N observations] -- topic1, topic2, topic3`
- Uses `openSessionsDB`/`closeSessionsDB` from `@cds/core` (VAULT-03 compliant — no direct better-sqlite3 import)
- `main()` is fail-silent: all errors go to `process.stderr`, output to `process.stdout` only (T-42-03 mitigation)
- Default session count: 3 (per D-140)

**Wiring:**
- `tsup.config.ts` — added `'cli/memory': 'packages/cds-cli/src/memory.ts'` entry
- `bin/cli.mjs` — added `case 'memory':` that routes to `dist/cli/memory.js` via `resolveDistPath`; NOT in `printHelp()` (internal command per D-146)
- `hooks/session-start-context.sh` — added D-140 SQLite memory injection block after budget check using the same fail-silent `$(...) 2>/dev/null` + `if [ -n "$MEMORY_OUT" ]` guard pattern

### Tests

6 unit tests in `memory.test.ts` using `vi.hoisted + vi.mock` pattern (matching quick.test.ts):
- Empty DB → "No sessions recorded yet" message
- Session format with observation count + topic excerpts
- `sessionCount` option respected
- Fallback to `s.summary` when no observations
- Missing summary → "no summary" text
- Footer "Use sessions.search MCP tool" always present

All 6 tests pass. All 102 existing cds-cli tests continue to pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used session summary as topic fallback instead of `searchObservations('*')`**
- **Found during:** Task 2 implementation
- **Issue:** The plan suggested `searchObservations('*', { sessionId: s.id, limit: 3 })` for topic excerpts, but also noted this may fail with FTS5 MATCH syntax error. FTS5 does not support bare `*` as a query. Using it would cause a SQLite error at runtime.
- **Fix:** Changed to `searchObservations('session', ...)` in the actual implementation as a safer query, with fallback to `s.summary ?? 'no summary'` when observations are empty. The test mocks both paths. The plan explicitly allowed this fallback.
- **Files modified:** packages/cds-cli/src/memory.ts
- **Commit:** 94d38bb

**2. [Rule 1 - Bug] `topEntitiesStmt` uses simple GROUP BY (no junction table)**
- **Found during:** Task 1 implementation
- **Issue:** The plan noted two alternatives for `topEntitiesStmt` — one joining `observation_entities` junction table, one using simple `GROUP BY name`. The plan instructed to check the actual schema and use the appropriate one. The schema uses `entities` column on observations as a JSON array (not a junction table), so the simple `GROUP BY name` alternative was used.
- **Fix:** Used `SELECT name, COUNT(*) AS count FROM entities GROUP BY name ORDER BY count DESC LIMIT @limit`.
- **Files modified:** packages/cds-core/src/vault/sessions.ts
- **Commit:** bc1c45f

**3. [Rule 3 - Blocking] pnpm store mismatch required reinstall**
- **Found during:** Task 2 verification
- **Issue:** The worktree environment was set up from a Linux CI container (`/workspace/.pnpm-store/v10`) but tests run on macOS. `@rollup/rollup-darwin-arm64` was missing, causing vitest to fail. The rollup linux arm64 packages were present but not darwin arm64.
- **Fix:** Ran `pnpm install` with the local macOS pnpm store to resolve missing darwin native binaries.
- **Impact:** No code changes; environment setup only.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. The `memory` command reads from an existing SQLite database (read-only prepared statements). The hook output goes to Claude's session context (existing boundary, already in threat model as T-42-02).

## Known Stubs

None. All code paths are wired end-to-end.

## Self-Check

All files listed below verified to exist:
- packages/cds-core/src/vault/sessions.ts — contains all 5 new methods ✓
- packages/cds-cli/src/memory.ts — exports formatMemorySummary and main ✓
- packages/cds-cli/src/memory.test.ts — 6 tests ✓
- tsup.config.ts — contains cli/memory entry ✓
- bin/cli.mjs — contains case 'memory' ✓
- hooks/session-start-context.sh — contains MEMORY_OUT block ✓

Commits verified:
- bc1c45f — feat(42-01): extend SessionsDB ✓
- 94d38bb — feat(42-01): implement memory CLI command ✓

## Self-Check: PASSED
