---
phase: 45-cross-project-search-graph-mcp-tools
plan: 02
title: "CLI: cds search --global flag"
status: complete
started: 2026-04-17T23:08:00Z
completed: 2026-04-17T23:10:00Z
---

# Summary: Plan 45-02 — CLI: cds search --global flag

## What Was Built

Added `--global` flag to the `cds search` CLI command. When passed, search uses `searchAllProjects()` from `@cds/core` to query all project vaults. Each result shows project name attribution in `[project] [type] snippet` format.

Without `--global`, existing single-project search behavior is completely unchanged.

## Key Files

### Modified
- `packages/cds-cli/src/search.ts` — `--global` flag parsing, `formatGlobalHit()`, `searchAllProjects()` import
- `packages/cds-cli/src/search.test.ts` — 4 new tests for `--global` behavior

## Deviations

None.

## Test Results

- 4 new tests: global empty results, flag position independence, global hit formatting, non-global preserves behavior
- All 131 tests passing

## Self-Check: PASSED
