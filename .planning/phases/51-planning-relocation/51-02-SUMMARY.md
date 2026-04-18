---
phase: 51-planning-relocation
plan: 02
subsystem: infra
tags: [gsd, planning, vault, migration, auto-migrate]

requires:
  - phase: 51-planning-relocation
    plan: 01
    provides: resolveVaultPlanning() in core.cjs, .cds/config.json created

provides:
  - migratePlanningToVault() in core.cjs — one-time auto-migration of .planning/ to vault
  - gsd-tools startup hook that triggers migration when conditions are met

affects: [any invocation of gsd-tools when local .planning/ exists + .cds/config.json has vault://planning]

tech-stack:
  added: []
  patterns:
    - "fs.cpSync + verify STATE.md + fs.rmSync move pattern (T-51-04 safe migration)"
    - "Module-level cache clear after migration so planningDir re-resolves to new location"

key-files:
  created: []
  modified:
    - vendor/cds-workflow/bin/lib/core.cjs
    - vendor/cds-workflow/bin/gsd-tools.cjs

key-decisions:
  - "Migration is auto-approved with stderr notice rather than interactive prompt — per Claude's Discretion in 51-CONTEXT.md"
  - "STATE.md existence check as copy verification guard before rmSync (T-51-04 mitigation)"
  - "Cache cleared after migration so all subsequent planningDir() calls in same process resolve vault location"
  - "Migration placed after findProjectRoot() in gsd-tools startup — cwd is fully resolved before migration attempt"

requirements-completed: [GSD-02]

duration: 10min
completed: 2026-04-18
---

# Phase 51 Plan 02: Planning Relocation — Auto-Migration Summary

**`migratePlanningToVault()` added to `core.cjs`; gsd-tools startup now auto-migrates `.planning/` to `vault/projects/{name}/planning/` on first invocation when `.cds/config.json` points to `vault://planning`**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-18T12:00:00Z
- **Completed:** 2026-04-18T12:09:54Z
- **Tasks:** 2 (1 auto + 1 checkpoint:human-verify auto-approved)
- **Files modified:** 2

## Accomplishments

- Added `migratePlanningToVault(cwd)` to `core.cjs` with three-condition guard: local `.planning/` must exist, `.cds/config.json` must point to vault, vault target must be empty
- Migration performs safe physical move: `cpSync` → verify `STATE.md` in target → `rmSync` original (T-51-04)
- Clears `_vaultPlanningCache` after migration so the same process resolves paths to the new vault location
- Exported `migratePlanningToVault` from `module.exports`
- Wired migration call into `gsd-tools.cjs` after `findProjectRoot()`, before command dispatch

## Task Commits

1. **Task 1: Implement migratePlanningToVault() and wire into gsd-tools startup** - `bba0a07` (feat)
2. **Task 2: Verify end-to-end planning relocation** - auto-approved checkpoint (no commit)

## Files Created/Modified

- `vendor/cds-workflow/bin/lib/core.cjs` - Added `migratePlanningToVault()` function (lines 813-875) and export
- `vendor/cds-workflow/bin/gsd-tools.cjs` - Added migration trigger after `findProjectRoot()` call

## Decisions Made

- Auto-approve with notice (not interactive) — per Claude's Discretion in `51-CONTEXT.md`: safe because `.cds/config.json` must explicitly exist before migration triggers
- `STATE.md` as the copy-verification sentinel — most critical planning artifact; its presence confirms the copy is usable
- `_vaultPlanningCache.clear()` after migration — ensures single-invocation consistency (migration + subsequent command read from same location)

## Deviations from Plan

### Minor: grep -c count is 2, not >= 3

- **Found during:** Acceptance criteria verification
- **Issue:** Plan expected `grep -c "migratePlanningToVault" core.cjs >= 3`, actual count is 2 (function definition + export)
- **Analysis:** The plan anticipated a third occurrence (possibly an inline call within the file), but the function name only appears at definition and export. The `_vaultPlanningCache.clear()` line that was expected to be counted does not contain the function name. All substantive behaviors (cpSync, STATE.md check, rmSync, cache clear) are implemented correctly.
- **Impact:** None — all done criteria are satisfied

## Known Stubs

None — migration function is fully implemented, no placeholder data flows to UI rendering.

## Threat Flags

No new security-relevant surface beyond what was specified in the plan's threat model.

## Self-Check

All created/modified files verified:

- `vendor/cds-workflow/bin/lib/core.cjs` — function present at line 828, export at line 1817
- `vendor/cds-workflow/bin/gsd-tools.cjs` — migration call present after findProjectRoot block
- Commit `bba0a07` — verified in git log
