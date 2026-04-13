---
phase: 12-sync-automation-install-mjs-refactor
plan: "03"
subsystem: install-wizard
tags:
  - refactor
  - install
  - modularization
  - testing
dependency_graph:
  requires:
    - 12-02
  provides:
    - thin-orchestrator-bin-install
    - lib-install-modules-tested
  affects:
    - bin/install.mjs
    - tests/install.test.mjs
tech_stack:
  added: []
  patterns:
    - thin-orchestrator pattern (entry point imports + sequences, no inline logic)
    - per-module importability smoke tests for mechanical extractions
key_files:
  created:
    - lib/install/prereqs.mjs
    - lib/install/profile.mjs
    - lib/install/projects.mjs
    - lib/install/components.mjs
    - lib/install/plugins.mjs
    - lib/install/vault.mjs
    - lib/install/gsd.mjs
    - lib/install/skills.mjs
    - lib/install/notebooklm.mjs
    - lib/install/git-conventions.mjs
    - lib/install/claude-md.mjs
    - lib/install/hooks.mjs
    - lib/install/summary.mjs
  modified:
    - bin/install.mjs
    - tests/install.test.mjs
decisions:
  - "installSessionHook called with (undefined, undefined, PKG_ROOT) in orchestrator — step/total params not needed at call site since hooks.mjs doesn't display a step header"
  - "re-export of installNotebookLM from bin/install.mjs preserved via export { installNotebookLM } from syntax for backward compat (D-10)"
  - "test regex for installNotebookLM body extraction updated to use |$ lookahead — extracted module has no trailing // ── section separator"
  - "lib/install/ modules created in worktree from main project sources since Wave 1 (plan 12-02) ran in a different worktree"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-13"
  tasks: 2
  files: 15
---

# Phase 12 Plan 03: install.mjs Refactor to Thin Orchestrator Summary

bin/install.mjs rewritten from 1471-line monolith to 108-line thin orchestrator importing 13 lib/install/*.mjs modules; tests/install.test.mjs updated with path migrations and 13 D-08 importability smoke tests.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Rewrite bin/install.mjs as thin orchestrator + create 13 lib/install/ modules | a835159 | bin/install.mjs, lib/install/*.mjs (13 files) |
| 2 | Update tests/install.test.mjs — migrate paths + add importability smoke tests | b3c9996 | tests/install.test.mjs |

## What Was Built

**Task 1 — Thin orchestrator:**
- `bin/install.mjs` reduced from 1471 lines to 108 lines
- All 13 wizard step modules created in `lib/install/`: prereqs, profile, projects, components, plugins, vault, gsd, skills, notebooklm, git-conventions, claude-md, hooks, summary
- Static `spawnSync` import replaces the `await import('child_process')` dynamic import from the original (Pitfall 6 resolved)
- `PKG_ROOT` defined at module level and passed as parameter to functions that need it (vault, skills, hooks, claude-md)
- `export { installNotebookLM } from '../lib/install/notebooklm.mjs'` preserves backward compat (D-10)

**Task 2 — Test migration:**
- Structural tests for NBLM-26 suite now read from `lib/install/notebooklm.mjs`
- Git-conventions structural tests (GIT-08/09/10) read from `lib/install/git-conventions.mjs`
- WR-04 hooks tests read from `lib/install/hooks.mjs`
- Functional test imports from `lib/install/notebooklm.mjs` directly
- 13 importability smoke tests added in `describe('lib/install/ module importability (D-08)')` block
- 35 tests pass in install.test.mjs; full suite: 429 pass / 431 total / 2 pre-existing hooks failures

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test regex end-of-file lookahead**
- **Found during:** Task 2
- **Issue:** The test for `installNotebookLM --break-system-packages removal` used regex `/async function installNotebookLM[\s\S]+?(?=\n\/\/ ──)/` which requires a trailing `// ──` section separator. The extracted module has no such separator (it's a single-function file).
- **Fix:** Updated regex to `/async function installNotebookLM[\s\S]+?(?=\n\/\/ ──|$)/` — adds `|$` to match to end of file when no section separator exists.
- **Files modified:** tests/install.test.mjs
- **Commit:** b3c9996

**2. [Context] Wave 1 modules created in this worktree**
- **Found during:** Task 1 setup
- **Issue:** This worktree (worktree-agent-af72195b) did not contain lib/install/ modules from plan 12-02, which ran in a different worktree. The 13 modules existed in the main project directory.
- **Fix:** Created all 13 modules in this worktree directly from the main project sources. Content is identical.
- **Impact:** No behavioral difference — content matches plan 12-02 output exactly.

## Verification Results

```
node --check bin/install.mjs           → SYNTAX OK
wc -l bin/install.mjs                  → 108 (under 120 hard max)
grep -c "from.*lib/install/" bin/install.mjs → 14 (13 import + 1 re-export)
grep "^const c = {" bin/install.mjs    → 0 (no inline utility defs)
grep "import('child_process')" bin/install.mjs → 0 (no dynamic import)
node -e "import('./bin/install.mjs')..." → "function function"
npm test (install.test.mjs)            → 35 pass, 0 fail
npm test (full suite)                  → 429 pass, 2 pre-existing fail (hooks.test.mjs)
```

## Known Stubs

None — all functions are fully implemented and wired.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. The orchestrator only calls existing functions.

## Self-Check: PASSED

- bin/install.mjs: FOUND
- lib/install/prereqs.mjs: FOUND
- lib/install/profile.mjs: FOUND
- lib/install/projects.mjs: FOUND
- lib/install/components.mjs: FOUND
- lib/install/plugins.mjs: FOUND
- lib/install/vault.mjs: FOUND
- lib/install/gsd.mjs: FOUND
- lib/install/skills.mjs: FOUND
- lib/install/notebooklm.mjs: FOUND
- lib/install/git-conventions.mjs: FOUND
- lib/install/claude-md.mjs: FOUND
- lib/install/hooks.mjs: FOUND
- lib/install/summary.mjs: FOUND
- tests/install.test.mjs: FOUND
- Commit a835159: FOUND
- Commit b3c9996: FOUND
