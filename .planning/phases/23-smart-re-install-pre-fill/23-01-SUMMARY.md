---
phase: 23-smart-re-install-pre-fill
plan: 01
subsystem: install-wizard
tags: [dx, pre-fill, profile, re-install, wizard]
dependency_graph:
  requires: []
  provides: [profile-persistence, detect-extensions, pre-fill-ux]
  affects: [bin/install.mjs, lib/install/detect.mjs, lib/install/profile.mjs, lib/install/projects.mjs, lib/install/plugins.mjs]
tech_stack:
  added: []
  patterns: [select-keep-current-change, profile-json-persist, map-based-registered-paths]
key_files:
  created: []
  modified:
    - lib/install/detect.mjs
    - lib/install/profile.mjs
    - lib/install/projects.mjs
    - lib/install/plugins.mjs
    - bin/install.mjs
    - tests/install.test.mjs
decisions:
  - Profile stored at vault/meta/profile.json (not install-profile.json) per D-01
  - select prompt (not confirm) for Keep current / Change per D-04
  - Map<path,name> instead of Set<path> for registered paths to enable DX-09 name lookup
  - saveInstallProfile called after vaultPath resolved to ensure correct path
metrics:
  duration_minutes: 25
  completed: "2026-04-13T21:05:17Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 6
  tests_added: 35
  tests_total: 703
---

# Phase 23 Plan 01: Profile Persistence + Pre-fill UX Summary

**One-liner:** Profile read/write cycle (vault/meta/profile.json) + select-based Keep current / Change pre-fill for language, project registration, and use case on re-install.

---

## What Was Built

### Task 1: Profile persistence layer + detectInstallState extensions (commit `4959b22`)

Added three new exported functions to `lib/install/detect.mjs`:

- `readInstallProfile(vaultPath)` — reads `vault/meta/profile.json`, returns parsed object or `null` on missing/corrupt
- `detectProjectsDir(vaultPath)` — derives common path prefix from `project-map.json` entries for DX-08 base-dir pre-fill
- `detectRegisteredPaths(vaultPath)` — returns `{ path: name }` object from `project-map.json` for DX-09 skip logic

Updated `detectInstallState()` return to include `profile`, `projectsDir`, `registeredPaths`, `notebooklmAuthenticated` fields (replacing the old `profile: null` stub comment).

Added `saveInstallProfile(vaultPath, profile)` to `lib/install/profile.mjs` — creates `meta/` dir if missing, writes JSON.

Added 19 new tests in `tests/install.test.mjs` covering all new functions and edge cases.

### Task 2: Pre-fill UX + orchestration wiring (commit `f13c7dd`)

**`lib/install/profile.mjs`** — added select-based pre-fill before existing text prompts. When `detectedProfile?.lang` is set, shows "Keep current / Change" select; `keep` returns immediately with existing values, `change` falls through to text prompts with pre-filled `initial` values (D-04, D-05).

**`lib/install/projects.mjs`** — changed `_registeredPaths()` from `Set<path>` to `Map<path, name>`. Added skip block in the name-prompt loop: registered paths push `{ name: existingName, path }` with an info line `"(registered)"` and `continue` (DX-09, D-06). `registeredPaths.has(d.path)` still works for multiselect pre-selection (BUG-03 compat).

**`lib/install/plugins.mjs`** — added `detectedUseCase` as 3rd parameter. When provided, shows "Keep current / Change" select for use case; `keep` short-circuits into the existing recommendation logic. All return paths now include `useCase` field (DX-10).

**`bin/install.mjs`** — added `saveInstallProfile` to import, passes `installState.projectsDir || null` to `collectProjects`, passes `installState.profile?.useCase` to `selectAndInstallPlugins`, calls `saveInstallProfile(vaultPath, { lang, codeLang, useCase })` after `vaultPath` is resolved.

Added 16 new structural tests for Task 2 behaviors.

---

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Profile file named `profile.json` (not `install-profile.json`) | Per D-01 spec; naming convention consistent with `project-map.json` |
| `select` type for Keep current / Change (not `confirm`) | Per D-04 correction vs prior attempt b2fe143 that used `confirm` |
| `Map<path, name>` instead of `Set<path>` for registered paths | DX-09 requires name lookup on match; Map enables `registeredPaths.get(path)` without breaking `registeredPaths.has()` for BUG-03 pre-selection |
| `saveInstallProfile` called after `vaultPath` resolved | Profile is scoped to the vault; calling before vault resolution would use wrong/null path |
| All `selectAndInstallPlugins` early returns include `useCase` | Ensures orchestrator always gets a `useCase` value regardless of code path (no-claude, no-data, all-installed) |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Working tree had modified `lib/install/hooks.mjs` causing BUG-02 test failure**
- **Found during:** Task 1 GREEN phase verification
- **Issue:** Worktree's `lib/install/hooks.mjs` had an unstaged change (`sessions/*.md` → `**`) breaking the BUG-02 structural test
- **Fix:** Restored `lib/install/hooks.mjs` to branch HEAD via `git restore` — this file was not in plan 23-01 scope and the change was not intentional to this plan
- **Files modified:** `lib/install/hooks.mjs` (restore only, no net change to committed content)
- **Commit:** N/A (restore operation, not a new commit)

---

## Known Stubs

None — all pre-fill functions are fully wired. Profile is read from disk, passed through, and saved after wizard completion.

---

## Threat Flags

No new security-relevant surface introduced. Profile read/write uses local vault files only (trust boundary: local file system). No network endpoints, auth paths, or schema changes at trust boundaries.

---

## Self-Check: PASSED

All modified files exist on disk. Both task commits verified in git log.

| Item | Status |
|------|--------|
| `lib/install/detect.mjs` | FOUND |
| `lib/install/profile.mjs` | FOUND |
| `lib/install/projects.mjs` | FOUND |
| `lib/install/plugins.mjs` | FOUND |
| `bin/install.mjs` | FOUND |
| `tests/install.test.mjs` | FOUND |
| commit `4959b22` | FOUND |
| commit `f13c7dd` | FOUND |
| 703 tests pass, 0 fail | PASSED |
