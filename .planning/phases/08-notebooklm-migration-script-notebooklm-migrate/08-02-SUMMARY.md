---
phase: "08-notebooklm-migration-script-notebooklm-migrate"
plan: "02"
subsystem: "notebooklm"
tags: ["migration", "tests", "fixture-matrix", "tdd", "notebooklm"]
dependency_graph:
  requires:
    - "lib/notebooklm-migrate.mjs (migrateVault)"
    - "lib/notebooklm.mjs (_resetBinaryCache)"
    - "tests/helpers/fixtures.mjs (makeTempVault)"
  provides:
    - "tests/notebooklm-migrate.test.mjs — full fixture matrix"
  affects:
    - "npm test suite (345 → 354 tests)"
tech_stack:
  added: []
  patterns:
    - "Inline PATH-stub (makeStub) for async migrateVault calls — NOT withStubBinary (sync)"
    - "Per-test beforeEach/afterEach: save PATH, _resetNotebooklmBinary, makeTempVault, cleanup stubDir"
    - "Shell case/echo stubs returning per-notebookId responses for listSources"
key_files:
  created:
    - "tests/notebooklm-migrate.test.mjs"
  modified: []
decisions:
  - "Inline PATH-stub over withStubBinary — withStubBinary is synchronous and cannot wrap async migrateVault calls (Pitfall 4)"
  - "Test 5 (partial failure) relies on upload verify step failing (empty target sources) rather than upload exit code, because uploadSource copies to tmpdir masking slug in path"
metrics:
  duration_ms: ~13000
  completed: "2026-04-12"
  tasks_completed: 1
  tasks_total: 2
  files_created: 1
  files_modified: 0
---

# Phase 08 Plan 02: Test Fixture Matrix Summary

**One-liner:** 9-test fixture matrix for migrateVault() covering all D-01–D-09 decisions using inline PATH-stub pattern.

## What Was Built

`tests/notebooklm-migrate.test.mjs` (660 lines) — full test coverage for the two-phase-commit migration orchestrator:

| Test | Scenario | Decision Covered |
|------|----------|-----------------|
| 1 | Empty shared notebook — no crash, empty results | D-07 dry-run |
| 2 | 27-source real-shape fixture — correct project grouping | D-07, D-01 |
| 3 | Dry-run produces no migration log file | D-07 no-mutation |
| 4 | Happy-path execute — all 3 sources uploaded, verified, deleted | D-01, D-02, D-03 |
| 5 | Partial Phase A failure → Phase B skipped, shared notebook untouched | D-03 |
| 6 | Duplicate target detection — skip upload, mark verified immediately | D-05 |
| 7 | Orphan source (no `__` prefix) — `skipped_orphan`, does not block Phase B | D-04 |
| 8 | Resume after interrupt — pre-existing `verified` entry skipped on re-run | D-06 |
| 9 | Phase B swallows `NotebooklmCliError` on already-deleted source | D-09, Pitfall 5 |

## Test Results

- `node --test tests/notebooklm-migrate.test.mjs` — **9/9 pass**
- `npm test` — **354 pass** (345 baseline + 9 new), 0 fail
- `git diff HEAD -- lib/notebooklm.mjs | wc -l` — **0** (D-03 boundary preserved)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `1cf7ec6` | test(08-02): add notebooklm-migrate.test.mjs — full fixture matrix (9 tests) |

## Task 2 Status

**Task 2 (Real-notebook smoke test) is a `checkpoint:human-verify` gate.** No code changes are needed — the user must manually run `node bin/cli.mjs notebooklm migrate` against a burner notebook to confirm real NotebookLM round-trip works before the Phase 8 PR merges.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 5 partial failure via upload path matching was not viable**
- **Found during:** Task 1 implementation
- **Issue:** `uploadSource` copies the file to a tmpdir before invoking the CLI binary, so the upload path argument contains a random tmpdir name — not the source slug. Shell `case "*alpha*"` could not match reliably.
- **Fix:** Stub returns empty `sources: []` for all target notebook `list` calls. The verify step (D-02 title match) then fails, producing `status: failed` entries and triggering `phaseBSkipped: true` correctly.
- **Files modified:** tests/notebooklm-migrate.test.mjs (test design only, no production code change)

## Known Stubs

None — all test assertions verify real state machine transitions via migration log JSON reads.

## Self-Check: PASSED

- `tests/notebooklm-migrate.test.mjs` — FOUND
- Commit `1cf7ec6` — FOUND
- `npm test` 354 pass — VERIFIED
- `lib/notebooklm.mjs` zero diff — VERIFIED
