---
phase: 31-skills-to-hooks-migration
plan: 02
subsystem: installer
tags: [install, hooks-registration, skill-cleanup, idempotent]
requires:
  - 31-01
provides:
  - 3 new settings.json hook registrations per project
  - D-17 deprecated-skill cleanup
  - D-15 skillNames trimmed to [session-manager, dev-research]
affects:
  - lib/install/hooks.mjs
  - lib/install/skills.mjs
  - tests/install.test.mjs
  - tests/hooks.test.mjs
  - tests/skills.test.mjs
  - skills/dev-router/SKILL.md (deleted)
  - skills/project-switcher/SKILL.md (deleted)
tech_stack:
  added: []
  patterns:
    - idempotent entry push via command-substring guard
    - project-level settings.json (not global) — BUG-01 precedent
key_files:
  created: []
  modified:
    - lib/install/hooks.mjs
    - lib/install/skills.mjs
    - tests/install.test.mjs
    - tests/hooks.test.mjs
    - tests/skills.test.mjs
  deleted:
    - skills/dev-router/SKILL.md
    - skills/project-switcher/SKILL.md
decisions:
  - D-01 Project-level settings.json for new UserPromptSubmit / PreToolUse entries
  - D-07 Idempotent add via command-substring guard (mirror budget-check/vault-auto-push)
  - D-10 PreToolUse matcher "Bash" + hook.if "Bash(git commit*)"
  - D-14 Atomic skill deletion (no .bak rename)
  - D-15 skillNames = ['session-manager', 'dev-research']
  - D-17 Cleanup helper removes deprecated skills on re-run
metrics:
  test_delta: +12 (8 installer + 4 new node-hook sanity)
  commits: 3 + 1 RED = 4 total
---

# Phase 31 Plan 02: Installer Wiring + Skill Cleanup Summary

Wires the 3 Plan 01 hooks into the install wizard and removes the 2 deprecated
skills from both repo and user installs.

## Tasks Completed

### Task 1: Register 3 hooks in installer (TDD)
- **RED:** `test(31): add failing tests for new hook registrations + skill cleanup` (db60221) — 8 failing
- **GREEN:** `feat(31): register dev-router/project-switcher/git-conventions hooks in installer (SKL-01/03/04)` (665f1ec)
- Extended copy loop (line 31) to ship 3 new .mjs hooks plus `gsd-workflow-enforcer.mjs` (was missing from the loop — caught as in-scope fix while updating the list)
- Added 3 idempotent-push blocks in `_writeSettingsFile`: UserPromptSubmit ×2 (dev-router, project-switcher), PreToolUse Bash with `if: "Bash(git commit*)"` (git-conventions-check)
- Verified: foreign hook preservation, 2-run idempotency, all 3 `.mjs` scripts copied to `~/.claude/hooks/`

### Task 2: Skill cleanup
- **Commit:** `feat(31): remove deprecated dev-router/project-switcher skills (SKL-01/03 D-14/D-15/D-17)` (7bc5dd1)
- Added `DEPRECATED_SKILLS` cleanup helper to `installCustomSkills()` — runs before install loop
- Trimmed `skillNames` array to `['session-manager', 'dev-research']`
- Deleted `skills/dev-router/SKILL.md` and `skills/project-switcher/SKILL.md` from repo
- Updated `tests/skills.test.mjs` `builtinSkills` array to match (regression guard intact)
- Added 4 new tests in `install.test.mjs` verifying cleanup + regression

### Task 3: tests/hooks.test.mjs coverage for new node hooks
- **Commit:** `test(31): cover 3 new node hooks in tests/hooks.test.mjs` (215a96e)
- Added `describe('node hooks (Phase 31)', ...)` block asserting file exists, `#!/usr/bin/env node` shebang, fail-silent on empty/malformed stdin

## Test Delta
- Plan 01 end: 766 → Plan 02 end: 785 (+19; but 7 of those were just moved from deleted builtinSkills loop into new scoped describes)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical] `gsd-workflow-enforcer.mjs` was not in the installer copy loop**
- **Found during:** Task 1 GREEN — the plan's interfaces block listed it as already-present, but the actual `lib/install/hooks.mjs` line 31 did not include it. Phase 29 must have shipped the hook script without wiring it into the installer.
- **Fix:** Added `'gsd-workflow-enforcer.mjs'` alongside the 3 new Phase 31 hooks.
- **Files modified:** lib/install/hooks.mjs (copy loop at line 31)
- **Commit:** folded into 665f1ec

## Auth Gates
None.

## Self-Check: PASSED
- lib/install/hooks.mjs: FOUND (contains dev-router, project-switcher, git-conventions-check, Bash(git commit*))
- lib/install/skills.mjs: FOUND (DEPRECATED_SKILLS present; skillNames trimmed)
- tests/install.test.mjs: FOUND (Phase 31 describes pass)
- tests/hooks.test.mjs: FOUND (node hooks (Phase 31) describe passes)
- tests/skills.test.mjs: FOUND (builtinSkills trimmed + SKL-02 describe passes)
- skills/dev-router/SKILL.md: MISSING (intentional deletion)
- skills/project-switcher/SKILL.md: MISSING (intentional deletion)
- Commits db60221, 665f1ec, 7bc5dd1, 215a96e: ALL FOUND
