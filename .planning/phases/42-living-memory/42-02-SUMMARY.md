---
phase: 42-living-memory
plan: "02"
subsystem: cds-cli
tags: [cli, search, stats, fts5, sqlite, memory]
dependency_graph:
  requires: ["42-01"]
  provides: ["D-144-search-cli", "D-145-mem-stats-cli"]
  affects: ["bin/cli.mjs", "tsup.config.ts"]
tech_stack:
  added: []
  patterns: ["wrap-existing-function", "process.stdout.write", "vi.hoisted mock pattern"]
key_files:
  created:
    - packages/cds-cli/src/search.ts
    - packages/cds-cli/src/search.test.ts
    - packages/cds-cli/src/stats.ts
    - packages/cds-cli/src/stats.test.ts
  modified:
    - tsup.config.ts
    - bin/cli.mjs
decisions:
  - "Used mem-stats (not stats) as CLI command name to avoid collision with existing stats -> analytics case on line 291"
  - "stats.ts exports formatDashboard() separately from main() to enable unit testing without process.cwd() dependency"
  - "Sessions[0] access uses optional chaining (sessions[0]?.start_time) for noUncheckedIndexedAccess compliance"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-17"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 2
---

# Phase 42 Plan 02: Search and Mem-Stats CLI Commands Summary

**One-liner:** `claude-dev-stack search` (FTS5 via Phase 37 sessionsSearch) and `claude-dev-stack mem-stats` (SQLite dashboard with entity count/top entities per D-145) implemented with 8 unit tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement search.ts + search.test.ts | 2060263 | packages/cds-cli/src/search.ts, search.test.ts |
| 2 | Implement stats.ts + stats.test.ts + tsup/cli wiring | ebfdb64 | packages/cds-cli/src/stats.ts, stats.test.ts, tsup.config.ts, bin/cli.mjs |

## What Was Built

### search.ts (D-144)
- Wraps Phase 37 `sessionsSearch` — no direct `better-sqlite3` import (VAULT-03 compliant)
- Resolves DB path: `~/vault/projects/<basename(cwd)>/sessions.db`
- Formats each hit: `[type] content-snippet\n  session: <8-char-id> | YYYY-MM-DD`
- Truncates content at 120 chars with `...`
- Exits code 1 on missing query or search error

### stats.ts (D-145)
- Uses `openSessionsDB`/`closeSessionsDB` from `@cds/core` (VAULT-03 compliant)
- Dashboard output format:
  ```
  Project: <name>
  Sessions: N (M this week)
  Observations: T (type1: count, type2: count)
  Entities: N (top: name1, name2, name3)
  Last activity: YYYY-MM-DD
  ```
- Week count: filters sessions where `start_time >= now - 7 days`
- Entity line: calls `countEntities()` + `topEntities(5)` per D-145 spec
- `formatDashboard()` exported separately for testability

### CLI Wiring
- `tsup.config.ts`: added `'cli/search'` and `'cli/stats'` entries
- `bin/cli.mjs`: added `case 'search':` and `case 'mem-stats':` (NOT `stats` — avoids collision with existing analytics route at line 291)
- `printHelp()`: added `search <query>` and `mem-stats` under Analytics section

## Test Results

- `search.test.ts`: 4 tests pass — usage error, empty results, hit formatting, truncation
- `stats.test.ts`: 4 tests pass — empty DB, counts with entities, last activity, stdout output

## Deviations from Plan

None — plan executed exactly as written. The `noUncheckedIndexedAccess` constraint was handled proactively in `stats.ts` with `sessions[0]?.start_time ?? 'none'`.

## Known Stubs

None — both commands wire to real DB access via existing Phase 37/35 implementations.

## Threat Flags

No new trust boundaries beyond what the plan's threat model covers:
- T-42-04: FTS5 MATCH injection handled by existing `sessionsSearch` error handling
- T-42-05: `basename(projectPath)` limits path traversal in `openSessionsDB`
- T-42-06: stdout disclosure accepted (user's own local data)

## Self-Check: PASSED

Files created:
- packages/cds-cli/src/search.ts — EXISTS
- packages/cds-cli/src/search.test.ts — EXISTS
- packages/cds-cli/src/stats.ts — EXISTS
- packages/cds-cli/src/stats.test.ts — EXISTS

Commits:
- 2060263 feat(42-02): implement search CLI command (D-144) with tests — EXISTS
- ebfdb64 feat(42-02): implement mem-stats CLI command (D-145) with tests, tsup + cli wiring — EXISTS
