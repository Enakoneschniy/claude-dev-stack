---
phase: 10-bugfixes
plan: "01"
subsystem: notebooklm
tags: [bugfix, notebooklm, migration, sync, tdd]
dependency_graph:
  requires: []
  provides: [FIX-01, FIX-02]
  affects: [lib/notebooklm-migrate.mjs, lib/notebooklm-cli.mjs]
tech_stack:
  added: []
  patterns: [counter-file stub technique for stateful shell stubs in async tests]
key_files:
  modified:
    - lib/notebooklm-migrate.mjs
    - lib/notebooklm-cli.mjs
    - tests/notebooklm-migrate.test.mjs
    - tests/notebooklm-cli.test.mjs
decisions:
  - "FIX-01: add ADR-prefixed key in buildFilePathMap instead of patching parseSourceTitle — minimal, targeted, no risk to other callers"
  - "FIX-02: extract total = stats.total ?? stats with backward-compat fallback — safe if syncVault shape ever reverts"
  - "Test 10 stub uses counter file to distinguish duplicate-check list call from verify-after-upload list call"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-12"
  tasks_completed: 2
  files_modified: 4
---

# Phase 10 Plan 01: NotebookLM Bugfixes (FIX-01 + FIX-02) Summary

Two targeted bug fixes for NotebookLM v0.9 regressions: ADR source title-to-disk-path mismatch in migration, and sync stats showing `undefined` due to per-project return shape refactor.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Fix ADR path resolution in `buildFilePathMap` (FIX-01) | `6f3decb` |
| 2 | Fix sync stats `undefined` display via `stats.total` (FIX-02) | `f0c351a` |

## What Was Built

### FIX-01: ADR path resolution in `buildFilePathMap`

**Root cause:** `_walkProjectFiles` uses `projectScoped: true` for ADR files, so the `title` field is `ADR-0001-auth.md` (no `slug__` prefix). `buildFilePathMap` keys entries by `slug/basename` (`myproject/0001-auth.md`) and also adds a second key from the title's post-`__` portion — but since scoped ADR titles have no `__`, the second key is never added. Migration's `migrateVault` looks up `slug/ADR-0001-auth.md` (from `parseSourceTitle` on shared-notebook title `slug__ADR-0001-auth.md`) — this key was absent, causing every ADR source to fail with `file_not_found`.

**Fix:** In `buildFilePathMap`, after the existing key insertions, add an ADR-specific key: when `f.category === 'adr'`, store `${f.projectSlug}/ADR-${f.basename}` → `f.absPath`. This maps `myproject/ADR-0001-auth.md` to the disk path `vault/projects/myproject/decisions/0001-auth.md`.

**Test (TDD):** Added Test 10 to `tests/notebooklm-migrate.test.mjs`. Uses a counter-file technique in the shell stub to distinguish the duplicate-check `source list` call (returns empty, forcing disk lookup) from the verify-after-upload `source list` call (returns the uploaded source). Confirmed RED before fix, GREEN after.

### FIX-02: Sync stats via `stats.total` sub-object

**Root cause:** `syncVault` was refactored in Phase 7 to return `{ perProject, total, durationMs, rateLimited, notebookId }` where per-count fields moved to `total: { uploaded, skipped, failed, errors }`. But `runSync` in `notebooklm-cli.mjs` still accessed `stats.uploaded`, `stats.skipped`, `stats.failed`, `stats.errors` directly — all `undefined`.

**Fix:** After `stats = await syncVault(...)`, extract `const total = stats.total ?? stats` (backward-compat fallback). Replace all count accesses with `total.*`. Fields that remain top-level (`durationMs`, `notebookId`, `rateLimited`) are unchanged.

**Test (TDD):** Added test suite `runSync — stats display uses stats.total (FIX-02)` to `tests/notebooklm-cli.test.mjs`. Creates a real vault project, stubs `notebooklm` binary to return empty notebook list (CDS creates it via `create`), runs `main(['sync'])`, asserts summary output contains `/\d+ uploaded/`, `/\d+ skipped/`, `/\d+ failed/` and does not contain `"undefined"`. Confirmed RED before fix, GREEN after.

## Test Results

```
# tests 408
# pass  408
# fail  0
```

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Test Design Note

Test 10 (FIX-01) required a counter-file technique not mentioned in the plan. The initial stub design used a static target notebook list that contained the ADR source title — which caused the duplicate-check to succeed before reaching the disk-path lookup, making the test pass without the fix. The counter-file approach (writing/reading a counter in the vault tmpdir) allows the stub to return empty on the first `source list` call and the uploaded source on the second, correctly exercising the `buildFilePathMap` lookup path.

## Known Stubs

None.

## Threat Flags

None — changes are internal path-key computation and stat field access only; no new network endpoints, auth paths, or trust boundaries introduced.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| lib/notebooklm-migrate.mjs | FOUND |
| lib/notebooklm-cli.mjs | FOUND |
| tests/notebooklm-migrate.test.mjs | FOUND |
| tests/notebooklm-cli.test.mjs | FOUND |
| commit 6f3decb (FIX-01) | FOUND |
| commit f0c351a (FIX-02) | FOUND |
