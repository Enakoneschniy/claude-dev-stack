---
phase: 24-wizard-ux-polish
plan: 01
subsystem: install-wizard
tags: [wizard, ux, install, prompts, step-counter, git-sync]
requires:
  - lib/install/detect.mjs (existing — gitRemote field)
  - lib/shared.mjs (prompt helper)
provides:
  - Git sync detection with Skip/Reconfigure/Remove select (UX-01)
  - Set up/Skip select for fresh vaults (UX-04)
  - Dynamic runtime step counter — no "Step 15 of 14" drift (UX-05)
  - Unified project count from installState.projects.length (UX-06)
  - Zero type: 'confirm' prompts in wizard scope (UX-07)
affects:
  - bin/install.mjs
  - lib/install/projects.mjs
  - lib/install/git-conventions.mjs
  - lib/install/notebooklm.mjs
  - lib/install/claude-md.mjs
tech-stack:
  added: []
  patterns:
    - "runtime steps[] array → totalSteps = preFlightCount + steps.length"
    - "resolveHookAction() helper to decide skip before building steps array"
    - "runVaultGitSync() + configureVaultRemote() extracted helpers"
key-files:
  created: []
  modified:
    - bin/install.mjs
    - lib/install/projects.mjs
    - lib/install/git-conventions.mjs
    - lib/install/notebooklm.mjs
    - lib/install/claude-md.mjs
    - tests/install.test.mjs
decisions:
  - D-01/D-02: git sync detection with 3-option select (Branch A) and 2-option select (Branch B)
  - D-03/D-04: totalSteps derived from runtime array, not static arithmetic
  - D-05: installState.projects.length is the single source of truth for project count
  - D-06/D-07: all 11 wizard-scope type: 'confirm' prompts swapped to type: 'select'
metrics:
  completed: "2026-04-15"
  tasks: 3
  commits: 6
  files_changed: 6
  tests_added: 17 (+ 1 test fix for BUG-05)
  tests_total: 737 (baseline 720)
---

# Phase 24 Plan 01: Wizard UX Polish Summary

**One-liner:** Unified wizard prompt style (zero `type: 'confirm'`), runtime-derived step counter, git-sync detection, and single project-count source across all install paths.

## What shipped

### Task 1 — Git sync detection (UX-01, UX-04)

- Introduced `runVaultGitSync(vaultPath, installState)` and `configureVaultRemote(vaultPath, opts)` helpers in `bin/install.mjs`.
- **Branch A** (gitRemote truthy): emits `✓ Git sync: configured (origin → ...)` status + 3-option select (Skip / Reconfigure / Remove).
  - `remove` runs `git remote remove origin` with `cwd: vaultPath` and prints "Remote removed from vault — run claude-dev-stack sync init to reconfigure later".
  - `reconfigure` reuses the remote-add + push flow.
- **Branch B** (no remote): 2-option select (Yes, set up now / Skip).
- All existing spawnSync calls, gitignore write, and 30 s push timeout preserved verbatim.
- **Commits:** `9db73ce` (RED), `47425aa` (GREEN).

### Task 2 — Dynamic step counter + unified project count (UX-05, UX-06)

- Replaced static `const totalSteps = setupSteps + installCount + 2;` math with a runtime-collected `steps[]` array.
- Each conditional install (components.vault, gsd, obsidianSkills, customSkills, deepResearch, notebooklm, loop.md, session hooks) is `steps.push(...)`-ed only if it will actually execute.
- Extracted `resolveHookAction(installState, reconfigure)` — called BEFORE the array is built, so a "skip" choice never consumes a step number.
- `totalSteps = steps.length + preFlightCount` (preFlightCount = 4 for prereqs / profile / projects / components).
- Plugins step moved into the runtime array (runs first at index 5 after pre-flight).
- UX-06: verified detect banner + vault step message both read from `installState.projects.length`.
- **Commits:** `d94c90d` (RED), `b169bbe` (GREEN).

### Task 3 — Confirm-to-select sweep (UX-07)

- Replaced all 11 `type: 'confirm'` occurrences in wizard scope with `type: 'select'`:
  - `bin/install.mjs`: ready (start / cancel), reconfigure (skip-aware / reconfigure)
  - `lib/install/projects.mjs`: hasBaseDir (base-dir / manual), addMore (yes / done)
  - `lib/install/git-conventions.mjs`: reconfigure (keep / reconfigure), acceptScopes (accept / skip), acceptBranch (correct / change), wantCommitlint (install / skip)
  - `lib/install/notebooklm.mjs`: proceed (install / skip), runFirstSync (sync / skip)
  - `lib/install/claude-md.mjs`: installNow (install / skip)
- Updated all callers from boolean checks (`if (!variable)`) to string-value comparisons (`if (variable === 'skip')`).
- Adjusted existing BUG-05 test to accept `reconfigure === 'keep'` alongside legacy `!reconfigure`.
- Reworded a comment in `bin/install.mjs` so the literal phrase `type: 'confirm'` does not falsely match the UX-07 grep assertion.
- **Commits:** `2572074` (RED), `60fa26b` (GREEN).

## Acceptance criteria — all green

| Criterion | Verified |
|-----------|----------|
| `grep -rn "type: 'confirm'"` over wizard scope → 0 matches | ✓ |
| `grep -n "setupSteps + installCount"` → 0 matches | ✓ |
| `grep -nE "Git sync: configured \(origin →"` → 1 match (line 173) | ✓ |
| `grep -nE "totalSteps\s*=\s*steps\.length"` → 1 match (line 206) | ✓ |
| `installState.projects.length` appears ≥ 2× | ✓ (3 matches) |
| `steps.push(` ≥ 5 matches | ✓ |
| `npx node --test tests/install.test.mjs` → 135 tests pass | ✓ |
| `npm test` → 737 tests pass (baseline 720) | ✓ |

## Deviations from plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] UX-06 test regex matched `===` comparisons as assignments**
- **Found during:** Task 2 verification
- **Issue:** The regex `/projectCount\s*=\s*([^;]+);/g` matched both assignments and `===` comparisons (e.g., `projectCount === 1 ? '' : 's'`), causing a false test failure even though no diverging assignment existed.
- **Fix:** Tightened regex to match only `const/let/var projectCount = ...` or `projectCount = ...` with a negative lookahead `(?!=)` to exclude `==` and `===`.
- **File:** tests/install.test.mjs
- **Commit:** folded into `b169bbe`

**2. [Rule 3 - Blocking] BUG-05 test hardcoded `!reconfigure` boolean check**
- **Found during:** Task 3 test run
- **Issue:** Existing BUG-05 test (Phase 19) asserted git-conventions.mjs contained `!reconfigure` boolean check. After swap to select, the check became `reconfigure === 'keep'`, breaking the BUG-05 assertion.
- **Fix:** Added `reconfigure === 'keep'` as an additional accepted pattern in the BUG-05 test. Legacy checks still pass.
- **File:** tests/install.test.mjs
- **Commit:** folded into `60fa26b`

**3. [Rule 1 - Bug] Code comment triggered UX-07 regex false-match**
- **Found during:** Task 3 test run
- **Issue:** The comment `// ... (no type: 'confirm')` in bin/install.mjs contained the literal phrase `type: 'confirm'`, matching the UX-07 grep assertion and failing the test even though no actual prompt used confirm.
- **Fix:** Reworded the comment to avoid the literal phrase.
- **File:** bin/install.mjs
- **Commit:** folded into `60fa26b`

### Structural decisions (vs plan)

- Plan suggested `buildStepPlan()` extraction. Inline runtime array in main() chosen — executes adequately for ~15-step wizard, easier to read alongside conditional guards. Documented in code comments.
- Plan allowed vault-git-sync helper extraction to its own file. Kept inline in bin/install.mjs (~65 lines). Plan explicitly permitted executor discretion.
- `saveInstallProfile` call moved to after the steps loop runs (previously ran right after vault path resolution). Verified no downstream helper reads the persisted profile during the same run, so the reorder is safe.

## Files touched

| File | Lines added | Lines removed | Net |
|------|-------------|---------------|-----|
| bin/install.mjs | +140 | -42 | +98 |
| lib/install/projects.mjs | +11 | -4 | +7 |
| lib/install/git-conventions.mjs | +27 | -14 | +13 |
| lib/install/notebooklm.mjs | +14 | -5 | +9 |
| lib/install/claude-md.mjs | +7 | -3 | +4 |
| tests/install.test.mjs | +136 | -1 | +135 |

## Commit chain

```
9db73ce test(24-01): add failing tests for UX-01/04 git sync detection
47425aa feat(24-01): detect existing vault git remote and use select prompts
d94c90d test(24-01): add failing tests for UX-05/06 dynamic step counter + project count
b169bbe feat(24-01): derive totalSteps from runtime steps array; unify project count
2572074 test(24-01): add failing tests for UX-07 confirm-to-select sweep
60fa26b feat(24-01): replace all type: confirm with type: select in wizard scope
```

## TDD Gate Compliance

Each task followed RED → GREEN sequence with explicit test commits preceding feature commits. No REFACTOR commits needed — GREEN implementations were already clean enough.

## Threat surface assessment

All 5 STRIDE threats from the plan's threat model were addressed:

- **T-24-01** (Tampering — git remote remove): vaultPath is resolved from detect.mjs, not user input — no arbitrary path injection.
- **T-24-02** (Info disclosure — remote URL in status line): accepted; URL is already user-visible via `git remote -v`.
- **T-24-03** (DoS — invalid select input): prompts library handles validation.
- **T-24-04** (EoP — caller boolean mismatch): all callers updated and exercised by 737-test suite; missing callers would default to skip branches (safe).
- **T-24-05** (Repudiation — remove action): clear ok() message provides recovery guidance.

No new threat surface introduced. No threat_flags added.

## Self-Check: PASSED

- `bin/install.mjs` exists (verified)
- `lib/install/projects.mjs` exists (verified)
- `lib/install/git-conventions.mjs` exists (verified)
- `lib/install/notebooklm.mjs` exists (verified)
- `lib/install/claude-md.mjs` exists (verified)
- `tests/install.test.mjs` exists (verified)
- All 6 commits present in git log on gsd/phase-24-wizard-ux-polish branch (verified)
