---
phase: 40-v1-0-alpha-polish-and-blockers
plan: "02"
subsystem: infra
tags: [gsd, patch, bypassPermissions, install-wizard, bash-permissions]

requires:
  - phase: 27
    provides: SHA-diff patch infrastructure (patches/ dir, gsd-auto-reapply-patches.sh)

provides:
  - patches/gsd-execute-phase-bypassperms.patch — unified diff adding permission_mode="bypassPermissions" to gsd-executor Task() in execute-phase.md
  - lib/install/gsd.mjs applyShippedPatches() — idempotent patch application at install time
  - hooks/gsd-auto-reapply-patches.sh *.patch loop — session-start re-application of unified diffs
  - tests/install-gsd-patches.test.mjs — structural assertions for the patch file and helper

affects: [gsd-executor, install-wizard, session-hooks]

tech-stack:
  added: []
  patterns:
    - "Unified-diff patches shipped in patches/*.patch, applied at install time by applyShippedPatches() and re-applied at session start by gsd-auto-reapply-patches.sh"
    - "Fail-soft patch application: dry-run detects already-applied (Reversed) vs hunk-mismatch; mismatch prints warning, never aborts wizard"

key-files:
  created:
    - patches/gsd-execute-phase-bypassperms.patch
    - tests/install-gsd-patches.test.mjs
  modified:
    - lib/install/gsd.mjs
    - bin/install.mjs
    - hooks/gsd-auto-reapply-patches.sh

key-decisions:
  - "Single Task(subagent_type=gsd-executor) block exists in execute-phase.md — patch targets only that block; plan's assumption of two blocks was incorrect"
  - "applyShippedPatches() called in both the up-to-date branch and the npx-success branch so both re-installs and fresh installs apply the patch immediately"
  - "gsd-auto-reapply-patches.sh now handles both *.md (SHA-diff) and *.patch (unified-diff) file types"

patterns-established:
  - "Unified-diff patches go in patches/*.patch; SHA-diff full-file replacements go in patches/*.md"

requirements-completed:
  - GSD-PATCH-BYPASSPERMS

duration: 25min
completed: 2026-04-17
---

# Phase 40 Plan 02: GSD Execute-Phase bypassPermissions Patch Summary

**Unified-diff patch adding `permission_mode="bypassPermissions"` to the `Task(subagent_type="gsd-executor")` call in execute-phase.md, shipped as `patches/gsd-execute-phase-bypassperms.patch` with idempotent install-time and session-start application**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-17T20:10:00Z
- **Completed:** 2026-04-17T20:15:00Z
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments

- Authored `patches/gsd-execute-phase-bypassperms.patch` — unified diff targeting the single `Task(subagent_type="gsd-executor", ...)` block in `~/.claude/get-shit-done/workflows/execute-phase.md`; dry-run verified against maintainer's GSD install
- Added `applyShippedPatches(pkgRoot)` to `lib/install/gsd.mjs` — idempotent, fail-soft, called from both the up-to-date and npx-success branches of `installGSD()`
- Extended `hooks/gsd-auto-reapply-patches.sh` with a `*.patch` unified-diff loop alongside the existing `*.md` SHA-diff loop, so the new patch is re-applied at every session start
- Added 7-test vitest suite asserting patch well-formedness and `applyShippedPatches()` no-op behavior

## Task Commits

1. **Task 1: Author patches/gsd-execute-phase-bypassperms.patch** — `604e15a` (feat)
2. **Task 2: Wire applyShippedPatches() into lib/install/gsd.mjs** — `b77792b` (feat)
3. **Task 3: Add tests/install-gsd-patches.test.mjs** — `fa14f7a` (test)
4. **Task 4: Verify hooks/gsd-auto-reapply-patches.sh handles new patch** — `c0a326b` (fix)

## Files Created/Modified

- `patches/gsd-execute-phase-bypassperms.patch` — unified diff: inserts `permission_mode="bypassPermissions",` after `model="{executor_model}",` in the worktree-mode Task() call
- `lib/install/gsd.mjs` — added `applyShippedPatches(pkgRoot)` export; `installGSD()` now accepts `pkgRoot` and calls the helper in both code paths
- `bin/install.mjs` — GSD step updated to pass `PKG_ROOT` to `installGSD(n, t, PKG_ROOT)`
- `hooks/gsd-auto-reapply-patches.sh` — added `*.patch` loop with idempotency and fail-soft warning
- `tests/install-gsd-patches.test.mjs` — 7 vitest assertions on patch structure and helper export

## Decisions Made

- **Single Task block**: The plan described two Task() invocations (worktree + sequential), but `execute-phase.md` has only one `Task(subagent_type="gsd-executor", ...)`. The sequential mode is described textually ("Omit `isolation="worktree"`") — not a second Task() call. The patch correctly targets the one block that exists.
- **`installGSD()` signature extension**: Added `pkgRoot` as third argument (optional — guards with `if (pkgRoot)`) to avoid breaking callers that don't pass it yet.
- **Unified-diff + SHA-diff coexistence**: `gsd-auto-reapply-patches.sh` now runs two loops — the existing `*.md` loop (full-file SHA replacement) and a new `*.patch` loop (unified diff via `patch -p1`). The two approaches serve different use cases and coexist without conflict.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adjusted test assertions from >= 2 to >= 1 for hunk/anchor counts**
- **Found during:** Task 3 (test authoring)
- **Issue:** Plan specified `>= 2` hunks and `>= 2` subagent_type anchor matches, expecting both a worktree and sequential Task() block. Actual execute-phase.md has only one such block — second occurrences do not exist.
- **Fix:** Reduced assertions to `>= 1` with inline comment explaining the discovery.
- **Files modified:** tests/install-gsd-patches.test.mjs
- **Verification:** 7/7 tests pass
- **Committed in:** fa14f7a (Task 3 commit)

**2. [Rule 3 - Blocking] Added *.patch loop to gsd-auto-reapply-patches.sh**
- **Found during:** Task 4 (verification)
- **Issue:** Script only iterated `*.md` files (SHA-diff replacements). New `*.patch` unified-diff files would never be picked up at session start.
- **Fix:** Added second loop for `*.patch` files using `patch -p1` with dry-run idempotency check.
- **Files modified:** hooks/gsd-auto-reapply-patches.sh
- **Verification:** `bash -n` passes; `grep '*.patch'` confirms glob present
- **Committed in:** c0a326b (Task 4 commit)

---

**Total deviations:** 2 auto-fixed (1 wrong assertion from incorrect plan assumption, 1 missing critical functionality)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

- `patch` binary from anaconda (`/opt/anaconda3/bin/patch`) returns "out of memory" on any input — system `/usr/bin/patch` works correctly. The `applyShippedPatches()` implementation uses the bare `patch` command which will resolve to whichever is first in PATH. On the maintainer's machine this works because GSD wizard runs via `spawnSync` where PATH excludes anaconda. Logged as potential edge case for users with broken `patch` in PATH.

## Known Stubs

None.

## Next Phase Readiness

- Patch delivery pipeline complete: `patches/gsd-execute-phase-bypassperms.patch` ships with the package, gets copied to `~/.claude/gsd-local-patches/` by the hooks installer, and is applied at both install time and session start.
- Users running CC 2.1.x who re-run the wizard will have `permission_mode="bypassPermissions"` patched into their local GSD install automatically.
- Remaining Phase 40 plans can proceed independently.

## Self-Check

- [x] `patches/gsd-execute-phase-bypassperms.patch` exists — commit 604e15a
- [x] `lib/install/gsd.mjs` exports `applyShippedPatches` — commit b77792b
- [x] `bin/install.mjs` passes PKG_ROOT — commit b77792b
- [x] `tests/install-gsd-patches.test.mjs` 7/7 pass — commit fa14f7a
- [x] `hooks/gsd-auto-reapply-patches.sh` has `*.patch` loop — commit c0a326b
- [x] Dry-run `patch --dry-run -p1 -d ~/.claude/get-shit-done < patch` exits 0

## Self-Check: PASSED

---
*Phase: 40-v1-0-alpha-polish-and-blockers*
*Completed: 2026-04-17*
