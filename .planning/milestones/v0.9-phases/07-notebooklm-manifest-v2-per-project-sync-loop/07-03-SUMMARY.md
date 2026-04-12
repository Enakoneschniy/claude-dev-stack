---
phase: 07-notebooklm-manifest-v2-per-project-sync-loop
plan: "03"
subsystem: notebooklm-doctor
tags: [notebooklm, doctor, per-project, deprecation, health-check]
dependency_graph:
  requires: ["07-02"]
  provides: ["per-project-doctor-stats", "NOTEBOOKLM_NOTEBOOK_NAME-deprecation-warning"]
  affects: ["lib/doctor.mjs"]
tech_stack:
  added: []
  patterns:
    - "dynamic import of listNotebooks/listSources in doctor (per-notebook async stats)"
    - "per-project try/catch error isolation (T-07-10 mitigation)"
    - "subprocess-stub test pattern for doctor with bash heredoc stubs"
key_files:
  created: []
  modified:
    - lib/doctor.mjs
    - tests/doctor.test.mjs
decisions:
  - "D-08: summary line (N notebooks, M sources total) + per-project breakdown indented with info()"
  - "D-09: deprecation warning only in doctor, not during sync; verbatim message from CONTEXT.md"
  - "D-03 boundary: lib/notebooklm.mjs untouched (zero diff)"
  - "assertion fix: 'notebooks: 0' matches actual output format from the 0-cds__ branch"
metrics:
  duration: "~12 min"
  completed: "2026-04-12"
  tasks_completed: 1
  files_modified: 2
  tests_added: 6
  tests_total: 345
---

# Phase 7 Plan 03: Doctor per-project NotebookLM stats + NOTEBOOKLM_NOTEBOOK_NAME deprecation Summary

**One-liner:** Doctor NotebookLM section shows per-project cds__ notebook count + source totals via listNotebooks/listSources, and warns on legacy NOTEBOOKLM_NOTEBOOK_NAME env var.

## What Was Built

Added two new behaviors to the `lib/doctor.mjs` NotebookLM section (within the `if (hasNotebooklm)` gate):

### Per-project stats block (D-08)
Calls `listNotebooks()` and `listSources(nb.id)` via dynamic import from `notebooklm.mjs`. Filters notebooks whose title starts with `cds__`, counts sources per notebook, and outputs:
- `ok("N notebooks, M sources total")` — summary line
- `info("  slug: K sources")` — per-project breakdown (indented)
- `info("per-project notebooks: 0 (run notebooklm sync to create)")` — when no cds__ notebooks found
- `info("per-project stats: unavailable")` — when listNotebooks throws

Each `listSources` call is wrapped in its own try/catch so a failure on one notebook shows `"slug: ? (error)"` without blocking the rest (T-07-10 mitigation).

### Deprecation warning (D-09)
After the stats block, checks `process.env.NOTEBOOKLM_NOTEBOOK_NAME`. If set, emits:
```
NOTEBOOKLM_NOTEBOOK_NAME is deprecated. Per-project notebooks (cds__{slug}) are now used. Will be removed in v1.0.
```
Increments `warnings++` so the summary line reflects it. Only present in doctor — not emitted during sync (as required by D-09).

## Tests Added (6 new — tests/doctor.test.mjs)

New describe block: `doctor — per-project NotebookLM stats + NOTEBOOKLM_NOTEBOOK_NAME deprecation (NBLM-V2-08/D-09)`

| # | Test | Assertion |
|---|------|-----------|
| 1 | 2 cds__ notebooks (5+3 sources) | output contains "2 notebooks" and "8 sources total" |
| 2 | per-project breakdown lines | output contains "alpha: 5" and "beta: 3" |
| 3 | D-09 deprecation when env var set | output contains verbatim message text |
| 4 | no deprecation when env var absent | output does NOT contain deprecation text |
| 5 | no stats when notebooklm binary missing | "sources total" absent; "not installed (optional)" present |
| 6 | 0 cds__ notebooks | output contains "notebooks: 0" |

Helper `makePerProjectStubBinDir()` added — creates a notebooklm bash stub that handles `list --json` (3 notebooks: cds__alpha, cds__beta, user-personal), `source list -n nb-1` (5 sources), `source list -n nb-2` (3 sources), and `auth check`.

## Acceptance Criteria Verification

- `grep -q "cds__" lib/doctor.mjs` — PASS
- `grep -q "NOTEBOOKLM_NOTEBOOK_NAME" lib/doctor.mjs` — PASS
- `grep -q "deprecated" lib/doctor.mjs` — PASS
- `grep -q "per-project" lib/doctor.mjs` — PASS
- `grep -q "listSources" lib/doctor.mjs` — PASS
- `git diff 1667af7..HEAD -- lib/notebooklm.mjs` — zero diff (D-03 boundary)
- `npm test` — 345/345 pass (0 fail)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Assertion mismatch for "0 notebooks" test**
- **Found during:** GREEN phase test run
- **Issue:** Test asserted `includes('0 notebook')` but actual output is `"per-project notebooks: 0 (run notebooklm sync to create)"` — the word `notebook` comes before `0`, not after
- **Fix:** Changed assertion to `includes('notebooks: 0') || includes('0 notebook')` to match actual output format
- **Files modified:** tests/doctor.test.mjs
- **Commit:** included in feat(07-03) commit

## Commits

| Hash | Message |
|------|---------|
| 7d068b0 | test(07-03): add failing tests for per-project stats and deprecation warning |
| c01511c | feat(07-03): doctor per-project NotebookLM stats + NOTEBOOKLM_NOTEBOOK_NAME deprecation warning |

## Known Stubs

None — all data flows are wired. Doctor makes live CLI calls (via listNotebooks/listSources) in production; tests use bash stub binaries.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes. The notebooklm CLI calls are read-only and already covered by T-07-09/T-07-10/T-07-11 in the threat model.

## Self-Check: PASSED

- `lib/doctor.mjs` — FOUND
- `tests/doctor.test.mjs` — FOUND
- commit `7d068b0` — FOUND
- commit `c01511c` — FOUND
- `lib/notebooklm.mjs` diff from base — 0 lines (D-03 boundary OK)
