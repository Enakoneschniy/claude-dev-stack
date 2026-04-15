---
phase: 31-skills-to-hooks-migration
plan: 01
subsystem: hooks
tags: [tdd, hooks, user-prompt-submit, pre-tool-use, regex, fail-silent]
requires: []
provides:
  - hooks/dev-router.mjs (SKL-01)
  - hooks/project-switcher.mjs (SKL-03)
  - hooks/git-conventions-check.mjs (SKL-04)
affects:
  - tests/dev-router-hook.test.mjs
  - tests/project-switcher-hook.test.mjs
  - tests/git-conventions-check-hook.test.mjs
tech_stack:
  added: []
  patterns:
    - budget-check.mjs stdin-parse / fail-silent pattern
    - ASCII/Cyrillic split regex (JS \b is ASCII-only)
    - macOS symlink-tolerant cwd resolution via realpathSync
key_files:
  created:
    - hooks/dev-router.mjs
    - hooks/project-switcher.mjs
    - hooks/git-conventions-check.mjs
    - tests/dev-router-hook.test.mjs
    - tests/project-switcher-hook.test.mjs
    - tests/git-conventions-check-hook.test.mjs
  modified: []
decisions:
  - D-02 dev-router UserPromptSubmit regex → additionalContext
  - D-03 ≤200 char hint cap
  - D-08 project-switcher reads vault/project-map.json (not project-registry.md)
  - D-09 fail-silent when registry missing
  - D-11 conventional commits regex `/^(feat|fix|...)(\(.+\))?!?:\s.+/`
  - D-12 warn-only default (exit 0 + stdout suggestion)
  - D-13 strict mode opt-in via .planning/config.json workflow.commit_validation
metrics:
  test_delta: +33 (9 dev-router + 9 project-switcher + 15 git-conventions-check)
  commits: 6 (RED/GREEN per feature)
---

# Phase 31 Plan 01: Skill-to-Hook Migration — hook scripts Summary

Zero-dep Node hooks replacing 3 deterministic skills (dev-router, project-switcher,
git-conventions). All three follow budget-check.mjs fail-silent pattern and emit
compact routing/validation hints.

## Features

### SKL-01: hooks/dev-router.mjs
- **RED:** `test(31): add failing tests for dev-router hook` (913898f) — 9 failing tests
- **GREEN:** `feat(31): add dev-router UserPromptSubmit hook (SKL-01)` (e23c157) — all 9 green
- Detects dev/research/session/end keywords (ASCII + Cyrillic split regex), emits ≤200-char routing hint
- ReDoS-safe: 4096-char prompt cap, simple anchored alternation, no nested quantifiers

### SKL-03: hooks/project-switcher.mjs
- **RED:** `test(31): add failing tests for project-switcher hook` (fe43c9a) — 8 failing
- **GREEN:** `feat(31): add project-switcher UserPromptSubmit hook (SKL-03)` (b8908b4) — 9/9 green
- Reads vault/project-map.json, emits hint only when matched project ≠ cwd project
- Word-boundary regex + macOS symlink-tolerant cwd resolution (realpathSync on both sides)

### SKL-04: hooks/git-conventions-check.mjs
- **RED:** `test(31): add failing tests for git-conventions-check hook` (47aaf81) — 15 failing
- **GREEN:** `feat(31): add git-conventions-check PreToolUse hook (SKL-04)` (fd67044) — 15/15 green
- Extracts `-m "..."` / `-m '...'` / `-m=...` commit message, validates against conventional commits regex
- Warn-only default; strict mode blocks (exit 2) when .planning/config.json sets workflow.commit_validation=strict
- Defensive fallbacks: malformed config → warn mode; amend/heredoc → silent

## Test Delta
- Baseline: 733 → After Plan 01: 766 (+33)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] VAULT_PATH fallback leaked real vault into hermetic tests**
- **Found during:** Task 2 project-switcher GREEN run
- **Issue:** `resolveVaultPath()` fell back to `~/vault` when VAULT_PATH pointed to a
  non-existent dir, letting the user's real project-map.json leak into tests.
- **Fix:** When VAULT_PATH env var is explicitly set, honor it strictly (return null
  if dir missing). Fallback to `~/vault` only when the env var is unset.
- **Files modified:** hooks/project-switcher.mjs
- **Commit:** folded into b8908b4 (same GREEN commit)

**2. [Rule 1 — Bug] macOS /var/folders ↔ /private/var/folders symlink mismatch**
- **Found during:** Task 2 project-switcher "current project silent" test
- **Issue:** `mkdtempSync` returns `/var/folders/...` but `process.cwd()` resolves to
  `/private/var/folders/...`. Prefix match failed → current=null → hint emitted for
  own project.
- **Fix:** `resolveCurrentProject` compares both literal and realpath-normalized
  cwd against both literal and realpath-normalized map keys.
- **Files modified:** hooks/project-switcher.mjs
- **Commit:** folded into b8908b4

## Auth Gates
None.

## Self-Check: PASSED
- hooks/dev-router.mjs: FOUND
- hooks/project-switcher.mjs: FOUND
- hooks/git-conventions-check.mjs: FOUND
- tests/dev-router-hook.test.mjs: FOUND
- tests/project-switcher-hook.test.mjs: FOUND
- tests/git-conventions-check-hook.test.mjs: FOUND
- Commits 913898f, e23c157, fe43c9a, b8908b4, 47aaf81, fd67044: ALL FOUND
