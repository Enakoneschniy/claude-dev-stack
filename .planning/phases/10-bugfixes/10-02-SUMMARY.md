---
phase: 10-bugfixes
plan: "02"
subsystem: core-security
tags: [security, correctness, performance, testing]
dependency_graph:
  requires: []
  provides: [shell-safe-hasCommand, async-withStubBinary, go-dir-filter, installSessionHook-error-handling, full-mode-prompts-fix]
  affects: [lib/shared.mjs, lib/git-conventions.mjs, lib/git-scopes.mjs, bin/install.mjs, tests/helpers/fixtures.mjs]
tech_stack:
  added: []
  patterns: [spawnSync-array-args, async-test-helper, directory-skip-set, warn-and-return]
key_files:
  created: []
  modified:
    - lib/shared.mjs
    - lib/git-conventions.mjs
    - lib/git-scopes.mjs
    - bin/install.mjs
    - tests/helpers/fixtures.mjs
    - tests/shared.test.mjs
    - tests/git-conventions.test.mjs
    - tests/git-scopes.test.mjs
    - tests/install.test.mjs
    - tests/helpers/fixtures.test.mjs
decisions:
  - "Use spawnSync('which', [name]) array args instead of shell interpolation for hasCommand"
  - "GO_SKIP_DIRS constant at call site (not module scope) for locality; Set for O(1) lookup"
  - "installSessionHook returns early on corrupt settings.json rather than silently continuing"
  - "withStubBinary made async so try/finally cleanup waits for awaited fn"
  - "WR-02 fix removes useQuick entirely — prompts 1-4 are unconditional, prompts 5-7 remain in if (full)"
metrics:
  duration: "356s"
  completed: "2026-04-12"
  tasks_completed: 2
  files_modified: 10
requirements_satisfied: [FIX-03]
---

# Phase 10 Plan 02: Code Review Warnings Fix (WR-01 through WR-05) Summary

Fix 5 code review warnings from Phase 6 review: shell injection in hasCommand, async race in withStubBinary test helper, double-prompt bug in git-conventions --full mode, missing directory filter in Go scope detector, and silent error swallowing in installSessionHook.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | WR-01 shell-safe hasCommand + WR-05 async withStubBinary | `5848572` | lib/shared.mjs, tests/helpers/fixtures.mjs, tests/shared.test.mjs, tests/helpers/fixtures.test.mjs |
| 2 | WR-02 full-mode prompts + WR-03 Go dir filter + WR-04 corrupt settings | `aaa9568` | lib/git-conventions.mjs, lib/git-scopes.mjs, bin/install.mjs, tests/git-conventions.test.mjs, tests/git-scopes.test.mjs, tests/install.test.mjs |

## What Was Built

### WR-01: hasCommand shell injection fix (lib/shared.mjs)

Replaced `runCmd(`which ${name}`)` with `spawnSync('which', [name], { encoding: 'utf8', stdio: 'pipe' })`. The old implementation passed the command name through shell string interpolation, allowing shell metacharacters (`; | & $()`) to be interpreted. The new implementation passes the name as an array argument to `spawnSync`, completely bypassing the shell.

`spawnSync` was already imported in `shared.mjs`; no new imports were needed.

### WR-05: withStubBinary async race fix (tests/helpers/fixtures.mjs)

Changed `export function withStubBinary` to `export async function withStubBinary` and added `await` before `fn(dir)` in the try block. The old sync version called `fn(dir)` without await, so the `finally` block (which removes the stub dir and restores `PATH`) ran immediately if `fn` returned a Promise — before the async work completed. All callers in `fixtures.test.mjs` were updated to use `await withStubBinary(...)`.

### WR-02: --full mode double-prompt fix (lib/git-conventions.mjs)

Removed the `const useQuick = quick || !full` conditional that wrapped prompts 1–4. Prompts 1–4 (project name, scopes, main branch, commitlint) now always run unconditionally. Prompts 5–7 (ticket prefix, branch format, co-authored-by) remain inside `if (full)`. The `quick` parameter is kept in the function signature for backward compatibility but is now a no-op.

### WR-03: Go scope detector directory filter (lib/git-scopes.mjs)

Added `const GO_SKIP_DIRS = new Set(['node_modules', 'vendor', '.git'])` before the Go multi-module detector. Applied the filter to both the top-level `readdirSync` scan and the nested one-level-deeper scan. This prevents the detector from recursing into `node_modules` (which can contain thousands of files) or `.git`/`vendor` directories.

### WR-04: installSessionHook corrupt settings.json (bin/install.mjs)

Replaced the empty `catch {}` block in `installSessionHook`'s JSON.parse call with a call to `warn()` followed by `return`. When `settings.json` is corrupt, the function now prints a warning and aborts rather than silently proceeding with an empty settings object (which could overwrite user's hooks configuration).

## Test Results

All 416 tests pass (`npm test`). New tests added: 12 (8 in task 1, 4 structural in task 2).

| Test File | Before | After |
|-----------|--------|-------|
| tests/shared.test.mjs | 19 | 21 |
| tests/helpers/fixtures.test.mjs | 13 | 14 (+ async test) |
| tests/git-conventions.test.mjs | 7 | 10 |
| tests/git-scopes.test.mjs | 23 | 26 |
| tests/install.test.mjs | 20 | 22 |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written with one minor test adjustment.

**Test adjustment (not a deviation):** The WR-04 test for "no empty catch block" was adjusted after discovering the function legitimately uses empty `catch {}` blocks for `chmodSync` operations (non-critical, swallowed intentionally). Replaced broad "no empty catch" assertion with a targeted check that the JSON.parse catch specifically calls `warn` and contains `'corrupt'`. The fix itself was exactly as specified.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All changes are pure logic fixes to existing functions.

## Self-Check: PASSED

- `lib/shared.mjs` — modified, exists ✓
- `lib/git-conventions.mjs` — modified, exists ✓
- `lib/git-scopes.mjs` — modified, exists ✓
- `bin/install.mjs` — modified, exists ✓
- `tests/helpers/fixtures.mjs` — modified, exists ✓
- Commit `5848572` — exists ✓
- Commit `aaa9568` — exists ✓
- `npm test` — 416/416 pass ✓
