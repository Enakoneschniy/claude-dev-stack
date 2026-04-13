---
phase: 15-dx-auto-approve-smart-re-install
plan: "03"
subsystem: install-wizard
tags: [dx, smart-reinstall, skip-aware, allowedTools, detect, tests]
dependency_graph:
  requires: [15-01, 15-02]
  provides: [DX-01-end-to-end, DX-02-end-to-end, detect-functional-tests]
  affects: [bin/install.mjs, tests/detect.test.mjs]
tech_stack:
  added: []
  patterns: [child-process-HOME-override, skip-reconfigure-select-prompt, detection-banner]
key_files:
  created: []
  modified:
    - bin/install.mjs
    - tests/detect.test.mjs
decisions:
  - "D-10: Detection banner shows vault path, project count, hooks status, git remote before step prompts"
  - "D-11/D-14: Per-section skip/reconfigure select prompt; skip returns cached value, reconfigure runs with pre-filled defaults"
  - "D-16: Hooks skip condition: hooksInstalled from installState (session-start-context pattern)"
  - "D-20: collectProfile receives installState.profile (null in v1 — no-op but contract wired)"
  - "D-21: collectProjects receives detected projects list for pre-selection"
  - "D-22: installSessionHook receives vaultPath (DX-01 end-to-end wired)"
  - "D-23: Functional tests use child process with HOME override for full isolation"
  - "reconfigure=false guard: initialized before conditional so all downstream checks work on fresh install"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-13"
  tasks_completed: 2
  files_changed: 2
---

# Phase 15 Plan 03: Wire Detection + Skip-Aware Flow Summary

**One-liner:** `bin/install.mjs` now shows a detection banner on re-install, offers skip/reconfigure per section, passes `vaultPath` to `installSessionHook` (DX-01 + DX-02 end-to-end); `tests/detect.test.mjs` extended with 13 functional child-process tests covering all 5 detection scenarios.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Wire detectInstallState + skip-aware flow into bin/install.mjs | 4587f00 |
| 2 | Add functional child-process tests to tests/detect.test.mjs | e633185 |

## Files Modified

### bin/install.mjs

Changes made (in order):

1. **Import added:** `import { detectInstallState } from '../lib/install/detect.mjs'`
2. **Detection block** (after "Ready to start?" prompt):
   - `detectInstallState()` called immediately
   - `reconfigure = false` initialized before conditional (guard for fresh install)
   - If `installState.vaultExists`: shows banner with vault path, project count, hooks status, git remote
   - Prompts "Reconfigure everything from scratch?" (confirm, default: N)
   - Prints skip-aware mode notice if not reconfiguring
3. **collectProfile call:** now passes `installState.profile` (null in v1, wires D-20)
4. **collectProjects call:** now passes detected projects list and null base dir (D-21)
5. **Vault step** replaced with skip/reconfigure select logic (D-11, D-14):
   - Skip: `vaultPath = installState.vaultPath`, prints info
   - Reconfigure: `getVaultPath(totalSteps, installState.vaultPath)` with pre-filled default
   - Fresh install: `getVaultPath(totalSteps, installState.vaultPath || null)`
6. **Hooks step** replaced with skip/reconfigure select logic (D-11, D-16):
   - Skip: `info('Session hooks already configured (skipped)')`, increments stepNum
   - Reconfigure/fresh: `installSessionHook(stepNum++, totalSteps, PKG_ROOT, vaultPath)` — **DX-01 end-to-end**

### tests/detect.test.mjs

Extended from 13 structural tests to 26 total (13 structural + 13 functional):

**Added helpers:**
- `runDetect(fakeHome)` — spawns a child node process with `HOME=fakeHome` override, imports detect.mjs, returns JSON-parsed state

**Added describe blocks (functional, isolated HOME):**
- `functional: no vault` — 3 tests: vaultExists false, vaultPath null, profile null
- `functional: vault present` — 4 tests: vaultExists true, vaultPath ends with /vault, gitRemote null, projects []
- `functional: hooks detection` — 3 tests: empty hooks → false, session-start-context → true, corrupt JSON → false
- `functional: projects parsing` — 3 tests: name parsed, path parsed, 2 projects parsed

## Verification

| Check | Result |
|-------|--------|
| `node --check bin/install.mjs` | exit 0 |
| `detectInstallState` matches in install.mjs | 2 (import + call) |
| `installSessionHook.*vaultPath` matches | 2 |
| `vaultAction\|hookAction` matches | 6 |
| `reconfigure` matches | 11 |
| `it(` count in detect.test.mjs | 26 (≥8 required) |
| `npm test` | 521 pass, 0 fail |
| Previous count (Plan 02 baseline) | 495 |
| New tests added | +26 in detect.test.mjs |

## Deviations from Plan

### Auto-deviation: tests/detect.test.mjs already existed

**Found during:** Task 2 setup
**Issue:** Plan 01 created `tests/detect.test.mjs` with 13 structural tests. Plan 03 planned to create this file from scratch with functional tests only.
**Fix:** Extended the existing file by adding the `runDetect()` helper and 4 new functional `describe` blocks with 13 tests, keeping all 13 structural tests intact. Total: 26 tests.
**Rule applied:** Rule 2 (preserve existing tests, no regression)
**Impact:** Zero — all tests pass, more coverage than planned (26 vs planned 10).

## Known Stubs

None. All detection parameters flow through to wizard modules. `installState.profile` is `null` in v1 — this is intentional per CONTEXT.md (D-07 deferred) and documented.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries beyond the plan's threat model (T-15-07, T-15-08, T-15-09 already registered). Detection banner displays data already on user's machine to the user running the installer (T-15-08: accepted).

## Self-Check: PASSED

- bin/install.mjs — exists, contains detectInstallState (2 matches), vaultPath in installSessionHook (2 matches)
- tests/detect.test.mjs — exists, 26 `it(` blocks
- Commits 4587f00 and e633185 present in git log
- npm test: 521 pass, 0 fail
