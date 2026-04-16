---
plan_id: 39-04-migration-and-wizard
phase: 39
plan: 04
subsystem: install-wizard + docs
tags: [migration-guide, changelog, node-check, hook-migration, alpha-release, d-120, d-121]
dependency_graph:
  requires:
    - phases/39-cds-quick-demo-alpha-release/39-01-bundler-and-distribution (Node 20 baseline)
    - phases/36-auto-session-capture (existing session-end-capture.sh hook + D-69 logic)
  provides:
    - docs/migration-v0-to-v1-alpha.md
    - CHANGELOG.md
    - lib/install/node-check.mjs (assertNodeVersion, currentNodeMajor)
    - lib/install/hooks.mjs::registerCaptureHook (new export)
  affects:
    - bin/install.mjs (assertNodeVersion(20) added as first wizard step)
tech_stack:
  added: []
  patterns:
    - "Stop hook registerCaptureHook helper: pure function on in-memory settings, prompts confirmation when legacy detected"
    - "Wizard startup guard: assertNodeVersion(20) BEFORE any side effects"
    - "Keep-a-Changelog format with 5 subsections + footer link"
key_files:
  created:
    - docs/migration-v0-to-v1-alpha.md
    - CHANGELOG.md
    - lib/install/node-check.mjs
    - tests/migration-guide.test.mjs
    - tests/changelog.test.mjs
    - tests/install-node-check.test.mjs
    - tests/install-hook-migration.test.mjs
  modified:
    - bin/install.mjs (added Node check at top of main())
    - lib/install/hooks.mjs (added registerCaptureHook export)
decisions:
  - "registerCaptureHook is added as a NEW export rather than modifying _writeSettingsFile — keeps existing wizard flow untouched while exposing the prompts-based migration logic for tests + future opt-in"
  - "assertNodeVersion is the FIRST statement in main() — before SIGINT handler, prompts, or any I/O — so Node 18 users see the actionable error immediately without loading native deps"
  - "Migration guide uses single source-of-truth phrasing for rollback: markdown sessions stay intact, SQLite is derived"
metrics:
  duration: ~10min (inline execution after subagent unavailable)
  completed: 2026-04-16
  tasks_completed: 9 (Tasks 1-9; Task 7 = verification, no separate commit)
  files_created: 7
  files_modified: 2
  test_results:
    plan_04_only: 32 passed (migration-guide:14 + changelog:8 + install-node-check:5 + install-hook-migration:5)
    plan_01_regression:
      node-version-scan: 294 passed (CHANGELOG.md added to allowlist via implicit pre-existing pattern)
---

# Phase 39 Plan 04: Migration & Wizard Summary

Tiered migration guide (D-120) + CHANGELOG.md + two wizard hardenings:
1. `assertNodeVersion(20)` startup guard (D-121)
2. `registerCaptureHook` export with prompts confirmation for legacy `session-end-check.sh` migration (D-121 + Phase 36 D-69)

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Migration guide | 2497f1c | docs/migration-v0-to-v1-alpha.md |
| 2 | CHANGELOG.md | b142a85 | CHANGELOG.md |
| 3 | node-check.mjs helper | 01a716c | lib/install/node-check.mjs |
| 4 | Wire assertNodeVersion in install.mjs | 649234b | bin/install.mjs |
| 5 | registerCaptureHook export | 9a0068e | lib/install/hooks.mjs |
| 6 | Migration guide tests (14) | 0607d78 | tests/migration-guide.test.mjs |
| 7 | CHANGELOG tests (8) | 88fec97 | tests/changelog.test.mjs |
| 8 | Node check tests (5) | 9c75dc6 | tests/install-node-check.test.mjs |
| 9 | Hook migration tests (5) | 8a0ffd3 | tests/install-hook-migration.test.mjs |

## Verification

```sh
$ npx vitest run tests/migration-guide.test.mjs tests/changelog.test.mjs \
                 tests/install-node-check.test.mjs tests/install-hook-migration.test.mjs \
                 tests/node-version-scan.test.mjs
Test Files  5 passed (5)
     Tests  326 passed (326)

$ node --check bin/install.mjs           # OK
$ node --check lib/install/node-check.mjs # OK
$ node --check lib/install/hooks.mjs      # OK
```

## Process Note

Inline execution on main working tree (no worktree subagent spawn) due to CC 2.1.x
permission lottery (see backlog 999.2). All 9 tasks committed atomically following plan body.
