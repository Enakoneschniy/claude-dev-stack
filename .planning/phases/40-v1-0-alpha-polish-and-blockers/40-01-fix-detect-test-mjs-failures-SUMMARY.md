---
phase: 40
plan: "01"
subsystem: tests
tags: [test-isolation, vitest, home-override, ci-unblock]
dependency_graph:
  requires: []
  provides: [detect.test.mjs-green, CI-unblocked]
  affects: [tests/detect.test.mjs]
tech_stack:
  added: []
  patterns: [vi.hoisted HOME override, subprocess-isolated detect tests]
key_files:
  created: []
  modified:
    - tests/detect.test.mjs
decisions:
  - "Used vi.hoisted approach (Plan Approach A) to override process.env.HOME before detect.mjs ES module import, satisfying D-127 traceability; the phase-40 subprocess fix was already merged to main but lacked vi.hoisted defense-in-depth and D-127 comment"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-17"
  tasks_completed: 2
  files_changed: 1
---

# Phase 40 Plan 01: Fix detect.test.mjs Failures Summary

One-liner: Added vi.hoisted HOME isolation and D-127 traceability to detect.test.mjs, ensuring VAULT_CANDIDATES resolves to a clean temp sandbox before any in-process detectInstallState() call.

## What Was Done

The 3 pre-existing `detect.test.mjs` failures (carried since v0.12) were caused by `VAULT_CANDIDATES` in `lib/install/detect.mjs` being computed at module import time via `homedir()`. When the real `~/vault/meta/profile.json` exists on the maintainer's machine, in-process tests asserting `state.profile === null` would fail.

**Root cause (D-127):** Static import of detect.mjs captures VAULT_CANDIDATES pointing at the real home. Setting HOME after the import has no effect.

**Fix applied:** Added a `vi.hoisted()` block at the top of `tests/detect.test.mjs` that:
1. Allocates a temp dir via `mkdtempSync`
2. Sets `process.env.HOME = dir` before any ES module import is evaluated
3. Stores the original HOME for restoration in afterAll
4. Added a D-127 comment block explaining the decision rationale
5. Added top-level `afterAll` that restores original HOME and removes the temp dir

## Task Results

### Task 1: Add vi.hoisted HOME override
- **Status:** Complete
- **Commit:** `76db8b8`
- **Files:** `tests/detect.test.mjs` (+38 lines, -1 line)
- **Result:** All 26 detect.test.mjs subtests pass including the 3 previously failing `profile===null` assertions

### Task 2: Verify full test suite remains green
- **Status:** Complete (no commit needed)
- **Result:** `tests/detect.test.mjs` 26/26 pass. Pre-existing failures in `pack-size.test.mjs`, `tsup-build.test.mjs`, `cli-mcp-dispatch.test.mjs`, and `agent-dispatcher.test.ts` are unrelated build/API-key failures that existed before this plan.

## Deviations from Plan

**1. [Rule 2 - Defense-in-depth] Added original HOME capture and restore alongside vi.hoisted**

- **Found during:** Task 1 implementation
- **Issue:** The plan's vi.hoisted template didn't capture/restore original HOME. In single-worker vitest modes this could affect sibling tests.
- **Fix:** Added `_origHome = process.env.HOME` capture in vi.hoisted, stored in `globalThis.__detectTestOrigHome`, and restored in the top-level afterAll.
- **Files modified:** `tests/detect.test.mjs`
- **Commit:** `76db8b8`

**2. [Context] Phase-40 subprocess fix already in main**

- The phase-40 subprocess-based fix (`f321ce2 fix(40-01)`) was already merged to main before this worktree was created. All tests were already passing via the subprocess approach.
- This plan's vi.hoisted approach adds a second layer of defense (in-process isolation) and the required D-127 traceability comment.
- No functional regression — 26/26 tests pass with both approaches layered.

## Verification Results

```
pnpm vitest run tests/detect.test.mjs --reporter=verbose
→ Test Files: 1 passed (1)
→ Tests: 26 passed (26)

git diff --stat lib/install/
→ (empty — production code untouched)

grep -c "D-127" tests/detect.test.mjs  → 3
grep -c "vi.hoisted" tests/detect.test.mjs → 1
grep -c "process.env.HOME" tests/detect.test.mjs → 3
grep -c "_TEST_HOME" tests/detect.test.mjs → 2
```

## Known Stubs

None.

## Self-Check: PASSED

- `tests/detect.test.mjs` modified and committed: `76db8b8` ✓
- `lib/install/detect.mjs` unchanged: confirmed via `git diff --stat lib/install/` empty ✓
- All 26 detect.test.mjs subtests green ✓
- D-127 traceability present (3 occurrences) ✓
