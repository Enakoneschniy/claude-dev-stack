---
phase: 15-dx-auto-approve-smart-re-install
plan: "02"
subsystem: install-wizard
tags: [dx, smart-reinstall, wizard, backward-compat]
dependency_graph:
  requires: []
  provides: [detected-state-params-in-wizard-modules]
  affects: [lib/install/vault.mjs, lib/install/profile.mjs, lib/install/projects.mjs]
tech_stack:
  added: []
  patterns: [optional-param-pre-fill, backward-compatible-extension]
key_files:
  created: []
  modified:
    - lib/install/vault.mjs
    - lib/install/profile.mjs
    - lib/install/projects.mjs
decisions:
  - "D-19: getVaultPath(totalSteps, detectedPath) — optional second param pre-fills askPath default"
  - "D-20: collectProfile(totalSteps, detectedProfile) — optional param pre-fills lang/codeLang initials"
  - "D-21: collectProjects(totalSteps, detectedProjects, detectedBaseDir) — optional params pre-fill base dir and pre-select existing projects"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-13"
  tasks_completed: 2
  files_modified: 3
---

# Phase 15 Plan 02: Wizard Module Detected-State Params Summary

Extended three install wizard modules with optional detected-state parameters so Plan 03's skip-aware flow can pre-fill defaults from live filesystem detection.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add detectedPath param to getVaultPath() | bb7aca7 | lib/install/vault.mjs |
| 2 | Add detectedProfile/detectedProjects params | 4710dfe | lib/install/profile.mjs, lib/install/projects.mjs |

## Changes Made

### lib/install/vault.mjs
- `getVaultPath(totalSteps)` → `getVaultPath(totalSteps, detectedPath)`
- `askPath('Vault path', join(homedir(), 'vault'))` → `askPath('Vault path', detectedPath || join(homedir(), 'vault'))`
- `installVault()` unchanged

### lib/install/profile.mjs
- `collectProfile(totalSteps)` → `collectProfile(totalSteps, detectedProfile)`
- `lang` initial: `'en'` → `detectedProfile?.lang || 'en'`
- `codeLang` initial: `'en'` → `detectedProfile?.codeLang || 'en'`

### lib/install/projects.mjs
- `collectProjects(totalSteps)` → `collectProjects(totalSteps, detectedProjects, detectedBaseDir)`
- `askPath('Projects directory', join(homedir(), 'Projects'))` → `askPath('Projects directory', detectedBaseDir || join(homedir(), 'Projects'))`
- multiselect `selected: false` → `selected: detectedProjects ? detectedProjects.some(p => p.path === d.path) : false`

## Verification

All acceptance criteria met:

| Check | Result |
|-------|--------|
| `grep -n "detectedPath" lib/install/vault.mjs` | 2 matches (param + usage) |
| `grep -n "detectedPath \|\| join" lib/install/vault.mjs` | 1 match |
| `grep -n "detectedProfile" lib/install/profile.mjs` | 3 matches (param, lang, codeLang) |
| `grep -n "detectedProjects" lib/install/projects.mjs` | 2 matches (param + selected) |
| `grep -n "detectedBaseDir" lib/install/projects.mjs` | 2 matches (param + usage) |
| `node --check lib/install/vault.mjs` | exit 0 |
| `node --check lib/install/profile.mjs` | exit 0 |
| `node --check lib/install/projects.mjs` | exit 0 |
| `npm test` | 495 pass, 0 fail |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all parameters flow directly into prompts as initial values. No UI-blocking stubs.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. Detected values are advisory-only (used as prompt defaults, user can change before confirming).

## Self-Check: PASSED

- lib/install/vault.mjs — exists and contains detectedPath
- lib/install/profile.mjs — exists and contains detectedProfile
- lib/install/projects.mjs — exists and contains detectedProjects + detectedBaseDir
- Commits bb7aca7 and 4710dfe present in git log
