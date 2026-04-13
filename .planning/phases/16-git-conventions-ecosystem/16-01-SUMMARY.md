---
phase: 16-git-conventions-ecosystem
plan: 01
subsystem: git-conventions
tags: [git, prereqs, gitmoji, skill-template]
dependency_graph:
  requires: []
  provides: [checkPrereqs, gitmoji-opt-in, GITMOJI_SECTION]
  affects: [lib/git-scopes.mjs, lib/git-conventions.mjs, templates/skills/git-conventions/SKILL.md.tmpl]
tech_stack:
  added: []
  patterns: [hasCommand-prereq-check, replaceAll-token-rendering]
key_files:
  created: []
  modified:
    - lib/git-scopes.mjs
    - lib/git-conventions.mjs
    - templates/skills/git-conventions/SKILL.md.tmpl
    - tests/git-scopes.test.mjs
decisions:
  - checkPrereqs exported as standalone function for downstream reuse
  - gitmoji mapping stored in git-scopes.json under optional 'gitmoji' key
  - installSkill renders {{GITMOJI_SECTION}} or empty string using existing replaceAll pattern
metrics:
  duration: ~15min
  completed: 2026-04-13
  tasks_completed: 2
  files_changed: 4
---

# Phase 16 Plan 01: Prereq Error Handling + Gitmoji Opt-in Summary

Prerequisite error handling and gitmoji opt-in support added to git-conventions infrastructure.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add checkPrereqs to git-scopes.mjs and wire into cmdInit | 438ead8 | lib/git-scopes.mjs, lib/git-conventions.mjs, tests/git-scopes.test.mjs |
| 2 | Add gitmoji opt-in flag and SKILL.md template token | 61689e7 | lib/git-scopes.mjs, lib/git-conventions.mjs, templates/skills/git-conventions/SKILL.md.tmpl, tests/git-scopes.test.mjs |

## What Was Built

- `checkPrereqs(projectDir)` exported from `lib/git-scopes.mjs` — returns `{ ok: boolean, missing: string[] }`. Checks git binary via `hasCommand('git')` and `.git` directory presence.
- `cmdInit` in `lib/git-conventions.mjs` calls `checkPrereqs` as its first step, returning early with formatted `fail()`/`info()` messages if git is missing or no `.git` dir found.
- `--gitmoji` flag parsed in the `main` dispatcher and passed to `cmdInit`. When set, adds 7-type Unicode emoji mapping to config before `writeScopes`.
- Full interactive mode adds prompt 8: `"Enable gitmoji prefixes? (y/N)"` after co-authored-by prompt.
- `installSkill` renders `{{GITMOJI_SECTION}}` with a gitmoji table when `config.gitmoji` is truthy, or empty string otherwise. Safety check catches any unreplaced tokens.
- `SKILL.md.tmpl` extended with `{{GITMOJI_SECTION}}` token after `{{CO_AUTHORED_BY_SECTION}}`.
- 6 new unit tests added (3 for checkPrereqs, 3 for gitmoji). All 537 tests pass.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `lib/git-scopes.mjs` — exists, `checkPrereqs` and `GITMOJI_SECTION` replaceAll present
- `lib/git-conventions.mjs` — exists, checkPrereqs import and call present, isGitmoji parsed
- `templates/skills/git-conventions/SKILL.md.tmpl` — exists, `{{GITMOJI_SECTION}}` token present
- `tests/git-scopes.test.mjs` — exists, checkPrereqs and gitmoji describe blocks present
- Commits 438ead8 and 61689e7 exist
- npm test: 537 pass, 0 fail
