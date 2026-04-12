---
phase: 06-git-conventions-skill-ecosystem
plan: 01
subsystem: shared-infra
tags: [atomicWriteJson, test-fixtures, shared, infrastructure]
dependency_graph:
  requires: []
  provides: [atomicWriteJson, makeTempVault, makeTempGitRepo, makeTempMonorepo, withStubBinary]
  affects: [lib/shared.mjs, tests/helpers/fixtures.mjs]
tech_stack:
  added: []
  patterns: [atomic-write-via-tmp-rename, stub-binary-on-PATH]
key_files:
  created:
    - tests/helpers/fixtures.mjs
    - tests/helpers/fixtures.test.mjs
  modified:
    - lib/shared.mjs
    - tests/shared.test.mjs
decisions:
  - atomicWriteJson uses write-to-.tmp then renameSync pattern (POSIX atomic on same filesystem)
  - makeTempGitRepo uses explicit GIT_AUTHOR_NAME/EMAIL env vars for CI-safety without global git config
  - withStubBinary uses finally block to guarantee PATH restoration even on exception
  - fixtures.test.mjs lives in tests/helpers/ and is not picked up by npm test glob (tests/*.test.mjs) — run directly
metrics:
  duration: ~8 minutes
  completed: "2026-04-12T11:20:33Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 6 Plan 1: Cross-cutting infra (atomicWriteJson + test fixtures) Summary

**One-liner:** Atomic JSON writer via tmp+rename in shared.mjs and 4 reusable test fixture helpers (makeTempVault, makeTempGitRepo, makeTempMonorepo, withStubBinary) with 32 self-tests.

## What Was Built

### Task 1: atomicWriteJson in lib/shared.mjs

Added `renameSync` to the `fs` import and exported `atomicWriteJson(filePath, obj)` which:
- Creates parent directories if absent
- Writes JSON with 2-space indent + trailing newline to `filePath.tmp`
- Atomically renames `.tmp` to final path (POSIX atomic on same filesystem)
- Leaves no `.tmp` residue on success

5 tests added to `tests/shared.test.mjs` covering: indent format, parent dir creation, no .tmp residue, JSON roundtrip, nested object preservation.

### Task 2: tests/helpers/fixtures.mjs

4 exported helpers for Phase 6+ test suites:

- **makeTempVault()** — creates `/tmp/cds-vault-*` with `meta/` + `projects/` subdirs, returns `{ dir, cleanup }`
- **makeTempGitRepo()** — creates `/tmp/cds-git-*`, runs `git init` + `git commit --allow-empty` with explicit author env vars (CI-safe), returns `{ dir, cleanup }`
- **makeTempMonorepo(stackType)** — creates `/tmp/cds-mono-{stackType}-*` with sentinel files for 8 stack types: pnpm-workspace, npm-workspaces, lerna, nx, turborepo, cargo-workspace, go-multi-module, python-uv, single-package
- **withStubBinary(name, scriptContent, fn)** — installs a `#!/bin/sh` stub on PATH, runs `fn(dir)`, restores PATH and removes stub dir in finally block

13 self-tests in `tests/helpers/fixtures.test.mjs`.

## Verification

- `node --test tests/shared.test.mjs` — 19 tests pass (was 14, +5 atomicWriteJson)
- `node --test tests/helpers/fixtures.test.mjs` — 13 tests pass
- `npm test` — 269 tests pass (baseline was 264, +5 from atomicWriteJson; fixtures tests not in glob)
- No `/tmp/cds-*` dirs remain after test runs

## Commits

| Hash | Message |
|------|---------|
| 1587f5d | feat(06-01): add atomicWriteJson to lib/shared.mjs |
| be0fafb | feat(06-01): add tests/helpers/fixtures.mjs with 4 test helpers |

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. `atomicWriteJson` follows the same pattern as the existing atomic write in `lib/notebooklm-manifest.mjs`. `withStubBinary` PATH mutation is temporary and guarded by finally block (T-06-03 mitigated as planned).

## Self-Check: PASSED

- [x] `lib/shared.mjs` contains `export function atomicWriteJson`
- [x] `lib/shared.mjs` import line contains `renameSync`
- [x] `tests/shared.test.mjs` contains `describe('atomicWriteJson'`
- [x] `tests/helpers/fixtures.mjs` exports all 4 functions
- [x] `tests/helpers/fixtures.test.mjs` contains 13 it() calls
- [x] commit 1587f5d exists
- [x] commit be0fafb exists
