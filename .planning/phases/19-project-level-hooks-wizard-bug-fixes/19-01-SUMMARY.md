---
phase: 19
plan: "01"
subsystem: hooks/install
tags: [bug-fix, tdd, patch-survival, project-hooks, permissions]
dependency_graph:
  requires: []
  provides:
    - wizard copies patches/ to ~/.claude/gsd-local-patches/ (D-07)
    - gsd-auto-reapply-patches.sh prefers gsd-local-patches over npm (D-07)
    - BUG-01/02 functional test coverage
  affects:
    - lib/install/hooks.mjs
    - hooks/gsd-auto-reapply-patches.sh
    - tests/install.test.mjs
    - tests/hooks.test.mjs
tech_stack:
  added: []
  patterns:
    - TDD (RED -> GREEN per wave)
    - cpSync recursive for wizard patch copy
    - PATCHES_DIR guard in shell resolution chain
key_files:
  created: []
  modified:
    - lib/install/hooks.mjs
    - hooks/gsd-auto-reapply-patches.sh
    - tests/install.test.mjs
    - tests/hooks.test.mjs
    - .planning/ROADMAP.md
decisions:
  - "D-07: unconditional cpSync (overwrite) chosen over mtime check — patches are small and version-pinned (per RESEARCH Open Question #2)"
  - "npm resolution loop wrapped in [ -z PATCHES_DIR ] guard to prevent overwriting gsd-local-patches priority"
metrics:
  duration: "~10 min"
  completed: "2026-04-14"
  tasks_completed: 9
  files_modified: 5
  tests_added: 4
  tests_total: 1416
requirements:
  - BUG-01
  - BUG-02
  - BUG-06
---

# Phase 19 Plan 01: BUG-06 D-07 + BUG-01/02 Audit Summary

**One-liner:** Wizard now copies `patches/transition.md` to `~/.claude/gsd-local-patches/` on install, and `gsd-auto-reapply-patches.sh` prefers that wizard-pinned location over npm/dev resolution — TeamCreate patch survives `/gsd-update` deterministically.

---

## What Shipped Per Wave

### Wave 1 — TDD RED tests (commit `6f4feb8`)
Added 2 failing tests establishing the D-07 contract:
- `installSessionHook copies patches/ to ~/.claude/gsd-local-patches/ (BUG-06 D-07)` — in `tests/install.test.mjs`
- `gsd-auto-reapply-patches.sh prefers ~/.claude/gsd-local-patches over npm resolution (BUG-06 D-07)` — in `tests/hooks.test.mjs`

Also fixed missing `mkdtempSync` import in `tests/hooks.test.mjs` (Rule 3 auto-fix).

### Wave 2 — Wizard side implementation (commit `0096ce7`)
In `lib/install/hooks.mjs` → `installSessionHook()`, added after `mkdirp(hooksDir)`:
```javascript
const patchesSrc = join(pkgRoot, 'patches');
const patchesDest = join(homedir(), '.claude', 'gsd-local-patches');
if (existsSync(patchesSrc)) {
  mkdirp(patchesDest);
  cpSync(patchesSrc, patchesDest, { recursive: true });
}
```
All imports already present — no new dependencies. `install.test.mjs` D-07 test turned GREEN.

### Wave 3 — Hook side implementation (commit `cd53b9a`)
In `hooks/gsd-auto-reapply-patches.sh`, added two changes:
1. After env-var block, new priority-2 check:
   ```bash
   if [ -z "$PATCHES_DIR" ] && [ -d "$HOME/.claude/gsd-local-patches" ]; then
     PATCHES_DIR="$HOME/.claude/gsd-local-patches"
   fi
   ```
2. Wrapped the npm resolution loop with `if [ -z "$PATCHES_DIR" ]; then ... fi` guard — without this guard, the npm global install (present on dev machine) was silently overwriting the `gsd-local-patches` resolution. All hooks tests turned GREEN.

### Wave 4 — BUG-01/02 audit + ROADMAP (commit `417bb2e`)
Audit found two functional coverage gaps:
- **BUG-01 (1c):** No test verified that `~/.claude/settings.json` is byte-identical after wizard runs with projects. → Added `installSessionHook does NOT write to ~/.claude/settings.json when projects provided (BUG-01)`.
- **BUG-02 (2c):** No test verified idempotency of `permissions.allow`. → Added `installSessionHook permissions.allow is idempotent across reruns (BUG-02)`.

Both tests pass. ROADMAP Phase 19 "Plans" updated with `19-01-PLAN.md` entry.

---

## Test Delta

| Test | File | Status |
|------|------|--------|
| `installSessionHook copies patches/ to ~/.claude/gsd-local-patches/ (BUG-06 D-07)` | tests/install.test.mjs | NEW GREEN |
| `installSessionHook does NOT write to ~/.claude/settings.json when projects provided (BUG-01)` | tests/install.test.mjs | NEW GREEN |
| `installSessionHook permissions.allow is idempotent across reruns (BUG-02)` | tests/install.test.mjs | NEW GREEN |
| `gsd-auto-reapply-patches.sh prefers ~/.claude/gsd-local-patches over npm resolution (BUG-06 D-07)` | tests/hooks.test.mjs | NEW GREEN |

**Test count:** 1412 → 1416 (+4 new tests, all green)

---

## Files Modified

| File | Change |
|------|--------|
| `lib/install/hooks.mjs` | Added D-07 patch copy block inside `installSessionHook` |
| `hooks/gsd-auto-reapply-patches.sh` | Added `gsd-local-patches` priority check + npm loop guard |
| `tests/install.test.mjs` | +3 new tests (D-07 copy, BUG-01 global-untouched, BUG-02 idempotency) |
| `tests/hooks.test.mjs` | +1 new test (D-07 hook precedence) + `mkdtempSync` import |
| `.planning/ROADMAP.md` | Phase 19 "Plans" entry added |

---

## Commit SHAs

| Wave | Commit | Message |
|------|--------|---------|
| Wave 1 (RED) | `6f4feb8` | `test(19): add D-07 wizard copy + hook precedence tests (RED)` |
| Wave 2 (GREEN wizard) | `0096ce7` | `feat(19): installSessionHook copies patches to gsd-local-patches (D-07)` |
| Wave 3 (GREEN hook) | `cd53b9a` | `feat(19): gsd-auto-reapply-patches prefers gsd-local-patches (D-07)` |
| Wave 4 (audit) | `417bb2e` | `test(19): close BUG-01/02 acceptance audit gaps` |

---

## Requirements Closure

| Requirement | Status | Evidence |
|-------------|--------|----------|
| BUG-01 | CLOSED | Structural tests (source-level) + functional test: global settings untouched when projects provided |
| BUG-02 | CLOSED | Structural tests (source-level) + functional test: permissions.allow idempotent across reruns |
| BUG-06 D-07 | CLOSED | Wizard copies patches → `gsd-local-patches`; hook prefers that location; both sides covered by automated tests |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing `mkdtempSync` import in tests/hooks.test.mjs**
- **Found during:** Task 2 (Wave 1) test execution
- **Issue:** `hooks.test.mjs` imported from `fs` without `mkdtempSync`, causing `ReferenceError: mkdtempSync is not defined` in the new D-07 test
- **Fix:** Added `mkdtempSync` to the `import { ... } from 'fs'` statement
- **Files modified:** `tests/hooks.test.mjs`
- **Commit:** `cd53b9a` (bundled with Wave 3 as the fix enabled the test to run)

**2. [Rule 1 - Bug] npm resolution loop overwrote gsd-local-patches priority**
- **Found during:** Task 6 (Wave 3) — D-07 hook test stayed RED after initial implementation
- **Issue:** The npm global loop (lines 32-43) lacked a `[ -z "$PATCHES_DIR" ]` guard, so it ran unconditionally and overwrote the `gsd-local-patches` resolution with the npm global path (which exists on the dev machine)
- **Fix:** Wrapped the npm loop in `if [ -z "$PATCHES_DIR" ]; then ... fi`
- **Files modified:** `hooks/gsd-auto-reapply-patches.sh`
- **Commit:** `cd53b9a`

---

## Manual Verification Required

After the next `/gsd-update` in a configured project, start a new Claude Code session and observe the SessionStart output. Expected message when patch was reapplied:

```
GSD patches auto-reapplied (1 file(s) updated)
```

This message appears only when the `transition.md` hash differs — silent on no-op. This cannot be automated because it requires a live `/gsd-update` cycle.

---

## Known Stubs

None — all implementations are fully wired. No placeholder data flows to UI rendering.

---

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. File writes are contained to user HOME (`~/.claude/gsd-local-patches/`) per T-19-01/T-19-05 accepted risks in the plan's threat model.

---

## Self-Check: PASSED

- [x] `lib/install/hooks.mjs` modified: FOUND
- [x] `hooks/gsd-auto-reapply-patches.sh` modified: FOUND
- [x] `tests/install.test.mjs` modified: FOUND
- [x] `tests/hooks.test.mjs` modified: FOUND
- [x] Commit `6f4feb8` exists: FOUND
- [x] Commit `0096ce7` exists: FOUND
- [x] Commit `cd53b9a` exists: FOUND
- [x] Commit `417bb2e` exists: FOUND
- [x] Full test suite: 1416 pass, 0 fail
