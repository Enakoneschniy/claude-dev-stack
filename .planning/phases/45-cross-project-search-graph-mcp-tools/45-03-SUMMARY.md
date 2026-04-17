---
phase: 45-cross-project-search-graph-mcp-tools
plan: 03
title: "SessionStart Auto-Surface + MiniSearch Fuzzy"
status: complete
started: 2026-04-17T23:13:00Z
completed: 2026-04-17T23:15:00Z
---

# Summary: Plan 45-03 — SessionStart Auto-Surface + MiniSearch Fuzzy

## What Was Built

Enhanced the SessionStart hook (`memory.ts`) to auto-surface relevant past observations in the session preamble using a combined search strategy:

1. **FTS5 exact search** — via existing `searchObservations()` method
2. **MiniSearch fuzzy search** — `{ fuzzy: 0.2, prefix: true }` over recent observations from the last 10 sessions

The implicit query is derived from the project basename by splitting on `-`, `_`, `.` and filtering tokens > 2 chars. Results are deduplicated by observation ID with FTS5 matches prioritized. Output capped at 5 observations, each showing `[type] snippet (date, source)`.

Added `minisearch@^7.2.0` as a runtime dependency of `@cds/cli`.

## Key Files

### Modified
- `packages/cds-cli/package.json` — added `minisearch` dependency
- `packages/cds-cli/src/memory.ts` — `findRelevantObservations()`, MiniSearch import, auto-surface block
- `packages/cds-cli/src/memory.test.ts` — 5 new auto-surface tests

## Deviations

- Plan specified `db.listObservations({ limit: 200 })` without sessionId, but the API requires sessionId. Adapted to collect observations from the 10 most recent sessions (up to 20 per session = 200 total). Same effective coverage.

## Test Results

- 5 new tests: FTS5 match, fuzzy match, deduplication, empty observations, max results cap
- All 132 tests passing

## Self-Check: PASSED
