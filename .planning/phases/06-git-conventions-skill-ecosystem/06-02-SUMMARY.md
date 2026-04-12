---
phase: 06-git-conventions-skill-ecosystem
plan: "02"
subsystem: git-conventions
tags: [git, scopes, skill-template, cli, detection, tdd]
dependency_graph:
  requires: [06-01]
  provides: [lib/git-scopes.mjs, lib/git-conventions.mjs, templates/skills/git-conventions/SKILL.md.tmpl]
  affects: [bin/cli.mjs, lib/shared.mjs]
tech_stack:
  added: []
  patterns:
    - atomicWriteJson for safe JSON config writes (lib/shared.mjs)
    - Sentinel-file detection order (pnpm > npm > lerna > nx > turbo > cargo > go > python-uv > fallback)
    - Token substitution with replaceAll for SKILL.md template rendering
    - TDD with node:test + node:assert/strict
key_files:
  created:
    - lib/git-scopes.mjs
    - lib/git-conventions.mjs
    - templates/skills/git-conventions/SKILL.md.tmpl
    - tests/git-scopes.test.mjs
    - tests/git-conventions.test.mjs
    - tests/helpers/fixtures.mjs
  modified:
    - lib/shared.mjs (added atomicWriteJson + renameSync import)
    - bin/cli.mjs (added scopes/scope case + Git Conventions help section)
decisions:
  - "atomicWriteJson added to lib/shared.mjs in this plan (parallel to Plan 01 adding it in its worktree)"
  - "python-uv detection expands glob patterns rather than using bare member names to get actual dir names"
  - "Template avoids literal Co-Authored-By string in config-reference section to prevent false positives in co_authored_by=false tests"
metrics:
  duration: "6m"
  completed: "2026-04-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 2
  tests_added: 30
  tests_baseline: 264
  tests_final: 294
---

# Phase 06 Plan 02: Git-Conventions Core Module Summary

**One-liner:** Core git-conventions module with 7-stack sentinel-file auto-detection, parameterized SKILL.md template with token substitution, and `scopes` CLI subcommand with 5 operations.

## What Was Built

### lib/git-scopes.mjs (8 exports)

Schema, detection, and skill installation module:

- `validateScopes(obj)` — validates v1 config shape; returns `{ valid, reason }`
- `readScopes(projectDir)` — reads + validates `.claude/git-scopes.json`
- `writeScopes(projectDir, config)` — atomic write via `atomicWriteJson`
- `detectStack(projectDir)` — 9-step detection cascade returning `{ scopes, confidence, source }`
- `detectMainBranch(projectDir)` — 3-step git fallback chain
- `installSkill(projectPath, config)` — renders SKILL.md.tmpl and writes to `.claude/skills/git-conventions/SKILL.md`
- `printCommitlintInstructions(config)` — print-only, never spawns npm
- `createDefaultConfig(name, detected)` — builds default v1 config with `co_authored_by: false`

### templates/skills/git-conventions/SKILL.md.tmpl

Parameterized template with 4 token placeholders:
- `{{SCOPES_LIST}}` — markdown bullet list of scope names
- `{{MAIN_BRANCH}}` — branch name string
- `{{TICKET_FORMAT}}` — ticket format suffix or empty string
- `{{CO_AUTHORED_BY_SECTION}}` — checklist item or empty string

Safety check: `installSkill` throws if any `{{` token remains after substitution.

### lib/git-conventions.mjs (CLI dispatcher)

`main(args)` dispatcher for `claude-dev-stack scopes <subcommand>`:
- `list` — show current scopes and config
- `init [--quick|--full]` — interactive setup (4 prompts in quick mode, 7 in full mode)
- `refresh` — re-detect + merge new scopes
- `add <name>` — add scope + reinstall skill
- `remove <name>` — remove scope + reinstall skill

### bin/cli.mjs changes

- Added `case 'scopes': case 'scope':` routing to `lib/git-conventions.mjs`
- Added "Git Conventions" section to `printHelp()` with all 5 subcommands

### tests/helpers/fixtures.mjs

Shared test helper module for all v0.9 phases:
- `makeTempVault()` — temp vault with `meta/` + `projects/` dirs
- `makeTempGitRepo()` — git repo with initial empty commit (CI-safe env vars)
- `makeTempMonorepo(stackType)` — fixture for all 9 stack types
- `withStubBinary(name, script, fn)` — PATH-based stub binary injection

## Test Results

| File | Tests | Passed | Failed |
|------|-------|--------|--------|
| tests/git-scopes.test.mjs | 23 | 23 | 0 |
| tests/git-conventions.test.mjs | 7 | 7 | 0 |
| Full suite (npm test) | 294 | 294 | 0 |

Baseline: 264 tests. Added: 30 tests. No regressions.

## Deviations from Plan

### Auto-added: atomicWriteJson in lib/shared.mjs

**Found during:** Task 1 setup
**Issue:** Plan 02 depends on `atomicWriteJson` from Plan 01, but Plan 01 runs in a parallel worktree and had not committed yet at plan execution time.
**Fix:** Added `atomicWriteJson` + `renameSync` import to this worktree's `lib/shared.mjs` independently. Both worktrees will add the same function; the final merge reconciles them.
**Rule:** Rule 3 (auto-fix blocking issue)
**Files modified:** lib/shared.mjs

### Auto-added: tests/helpers/fixtures.mjs

**Found during:** Task 1 test setup
**Issue:** Plan 02 tests import from `tests/helpers/fixtures.mjs` which is created by Plan 01, but Plan 01 runs in parallel and hadn't created it yet.
**Fix:** Created `tests/helpers/fixtures.mjs` in this worktree with all 4 exports matching the Plan 01 spec.
**Rule:** Rule 3 (auto-fix blocking issue)
**Files modified:** tests/helpers/fixtures.mjs (created)

### Template Co-Authored-By word fix

**Found during:** Task 1 TDD GREEN
**Issue:** SKILL.md.tmpl Config Reference section contained literal "Co-Authored-By" in the field description, causing `installSkill` with `co_authored_by=false` to still produce a file containing that string.
**Fix:** Changed "whether to include Co-Authored-By in commits" to "whether to include co-authorship attribution in commits" in the template.
**Rule:** Rule 1 (auto-fix bug)
**Files modified:** templates/skills/git-conventions/SKILL.md.tmpl

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-06-04 | `readScopes` wraps `JSON.parse` in try/catch, validates via `validateScopes` before use |
| T-06-06 | `installSkill` throws if `content.includes('{{')` — unreplaced tokens are caught |
| T-06-07 | `printCommitlintInstructions` only calls `console.log`, never `spawnSync` |

## Known Stubs

None. All 8 exports are fully implemented and tested.

## Threat Flags

None. No new network endpoints, auth paths, or external API surfaces introduced. All file access is limited to project directories passed explicitly by the caller.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| lib/git-scopes.mjs | FOUND |
| lib/git-conventions.mjs | FOUND |
| templates/skills/git-conventions/SKILL.md.tmpl | FOUND |
| tests/git-scopes.test.mjs | FOUND |
| tests/git-conventions.test.mjs | FOUND |
| tests/helpers/fixtures.mjs | FOUND |
| 06-02-SUMMARY.md | FOUND |
| commit 8655a3f (Task 1) | FOUND |
| commit dc1a4f6 (Task 2) | FOUND |
