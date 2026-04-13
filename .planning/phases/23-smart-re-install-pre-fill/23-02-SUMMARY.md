---
phase: 23-smart-re-install-pre-fill
plan: 02
subsystem: install-wizard
tags: [dx, version-check, auth-detection, bulk-prompt, re-install, wizard]
dependency_graph:
  requires: [23-01]
  provides: [gsd-version-check, notebooklm-auth-detection, loop-md-bulk-prompt, git-conventions-bulk-prompt]
  affects: [lib/install/gsd.mjs, lib/install/notebooklm.mjs, lib/install/components.mjs, lib/install/git-conventions.mjs, bin/install.mjs, tests/install.test.mjs]
tech_stack:
  added: []
  patterns: [version-check-skip-update, auth-aware-select, bulk-select-gate, configureAll-flag]
key_files:
  created: []
  modified:
    - lib/install/gsd.mjs
    - lib/install/notebooklm.mjs
    - lib/install/components.mjs
    - lib/install/git-conventions.mjs
    - bin/install.mjs
    - tests/install.test.mjs
decisions:
  - installGSD made async (was sync) — required for select prompt in update flow
  - loop.md uses select (not confirm) for all prompts — consistent with D-04 project feedback
  - git-conventions configureAll=null preserves existing per-project detailed flow for 'Choose per project'
  - "First sync" ok/warn messages kept in the new-login path (only the prompt message replaced)
metrics:
  duration_minutes: 20
  completed: "2026-04-13T21:40:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 6
  tests_added: 21
  tests_total: 714
---

# Phase 23 Plan 02: GSD Version Check + NotebookLM Auth + Bulk Prompts Summary

**One-liner:** Version-aware GSD install (skip when current, Update/Skip select when outdated), auth-aware NotebookLM (Skip/Re-login/Run sync now select), and bulk select gates for loop.md and git-conventions replacing per-project confirm loops.

---

## What Was Built

### Task 1: GSD version check (DX-11) + NotebookLM auth detection (DX-12) (commits `d9fa29a`, `f9c2bee`)

**`lib/install/gsd.mjs`** — converted `installGSD` from sync to async. Added two internal helpers:
- `_installedGSDVersion()` — reads `~/.claude/get-shit-done/package.json`, returns version or null
- `_latestGSDVersion()` — runs `npm view get-shit-done-cc version` with 10s timeout, returns version or null

Version-aware flow:
- Versions match → `ok("GSD: up to date (v{X})")`, return true (auto-skip, D-08)
- Versions differ → `select` prompt "Update / Skip" (D-09)
- Not installed → fall through to npx install

**`lib/install/notebooklm.mjs`** — added `alreadyAuthenticated` as 4th parameter. When true, shows 3-choice select "Skip / Re-login / Run sync now" before the install flow (D-10, D-11). Sync action uses `syncVault()` directly (D-12). "Run first NotebookLM sync now?" replaced with "Run sync now?" in the post-login prompt.

**`bin/install.mjs`** — updated `installGSD` call to `await` (now async), passes `installState.notebooklmAuthenticated` to `installNotebookLM`.

Added 13 new structural tests covering DX-11/DX-12 behaviors.

### Task 2: Bulk prompts for loop.md and git-conventions (DX-13) (commits `6318663`, `4603f21`)

**`lib/install/components.mjs`** — rewrote `installLoopMd` with split logic:
- `newProjects` (no loop.md) and `installedProjects` (loop.md exists) are processed separately
- For new projects (N > 1): 3-choice select "Yes all N / Choose per project / Skip"
- For existing projects (N > 1): 3-choice select "Yes overwrite all N / Choose per project / Skip"
- Per-project fallback uses `type: 'select'` (not confirm) — consistent with D-04
- Zero `type: 'confirm'` in the entire file

**`lib/install/git-conventions.mjs`** — added bulk prompt gate before the per-project loop:
- When N > 1: 3-choice select "Yes all N / Choose per project / Skip all"
- `configureAll = true` → auto-accepts detected scopes and branch, writes config, installs skill
- `configureAll = null` → falls through to existing per-project detailed flow
- `action === 'skip'` → early return true (all skipped)

Added 8 new structural tests covering DX-13 behaviors.

---

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `installGSD` made async | Select prompt for Update/Skip required await — sync function cannot use prompts |
| loop.md uses `type: 'select'` everywhere (no confirm) | D-04 + project feedback ("Select prompts over y/N confirms") — consistent with all other wizard prompts |
| `configureAll = null` as per-project signal | Tri-state (null/true/false) cleanly separates: not asked yet, bulk-all, skip-all |
| "First sync" ok/warn messages kept after new login | These are result messages (not prompts) — D-12 only requires replacing the prompt text |

---

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria verified.

---

## Known Stubs

None — all new code paths are fully wired to real logic.

---

## Threat Flags

**T-23-04 mitigated:** `_latestGSDVersion()` uses 10-second `spawnSync` timeout. If npm registry times out, function returns null and install falls through to npx (safe fallback).

No new security-relevant surface introduced beyond what is in the plan's threat model.

---

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `lib/install/gsd.mjs` contains `_installedGSDVersion` | FOUND |
| `lib/install/gsd.mjs` contains `_latestGSDVersion` | FOUND |
| `lib/install/gsd.mjs` is async | FOUND |
| `lib/install/notebooklm.mjs` contains `alreadyAuthenticated` | FOUND |
| `lib/install/notebooklm.mjs` contains `Re-login`, `Run sync now` | FOUND |
| `lib/install/notebooklm.mjs` — "Run first NotebookLM sync now?" removed | CONFIRMED (0 matches) |
| `lib/install/components.mjs` contains `newProjects`, `installedProjects` | FOUND |
| `lib/install/components.mjs` — zero `type: 'confirm'` | CONFIRMED (0 matches) |
| `lib/install/git-conventions.mjs` contains `Configure git conventions for all` | FOUND |
| `lib/install/git-conventions.mjs` contains `configureAll` (6 occurrences) | FOUND |
| `bin/install.mjs` contains `await installGSD` | FOUND |
| `bin/install.mjs` contains `notebooklmAuthenticated` | FOUND |
| commit `d9fa29a` (test RED Task 1) | FOUND |
| commit `f9c2bee` (feat Task 1) | FOUND |
| commit `6318663` (test RED Task 2) | FOUND |
| commit `4603f21` (feat Task 2) | FOUND |
| 714 tests pass, 0 fail | PASSED |
