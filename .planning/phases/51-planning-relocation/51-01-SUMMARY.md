---
phase: 51-planning-relocation
plan: 01
subsystem: infra
tags: [gsd, planning, vault, path-resolution, config]

requires:
  - phase: 50-gsd-fork-vendor
    provides: vendored cds-workflow engine under vendor/cds-workflow/

provides:
  - resolveVaultPlanning() in core.cjs — vault-aware planning path resolution with cache
  - planningDir/planningRoot updated to use vault path from .cds/config.json
  - findProjectRoot() recognizes .cds/config.json as project root anchor
  - gsd-tools.cjs worktree resolution respects .cds/config.json
  - .cds/config.json in project root pointing planning to vault://planning
  - .planning/ excluded from project git via .gitignore

affects: [52-planning-migration, 53-config-system, any phase using planningDir/planningPaths/planningRoot]

tech-stack:
  added: []
  patterns:
    - "vault:// URI scheme in .cds/config.json for vault-relative paths"
    - "Module-level Map cache (_vaultPlanningCache) for filesystem reads per cwd"
    - "BAD_SEGMENT regex reused for project-map.json name validation (T-51-02)"

key-files:
  created:
    - .cds/config.json
  modified:
    - vendor/cds-workflow/bin/lib/core.cjs
    - vendor/cds-workflow/bin/gsd-tools.cjs
    - .gitignore

key-decisions:
  - "resolveVaultPlanning() returns null (not throws) on any failure — triggers silent fallback to .planning/"
  - "Caching per cwd via module-level Map — avoids re-reading .cds/config.json on every planningDir call"
  - "BAD_SEGMENT applied to project name from project-map.json — satisfies T-51-02 without new regex"
  - "vault:// prefix check added in findProjectRoot() as first anchor before .planning/ walk — handles vault-only projects"

patterns-established:
  - "resolveVaultPlanning pattern: read .cds/config.json → discover vault → lookup project-map.json → return path"
  - ".cds/config.json as committed project config (not gitignored), parallel to .claude/settings.json"

requirements-completed: [GSD-02, GSD-03]

duration: 18min
completed: 2026-04-18
---

# Phase 51 Plan 01: Planning Relocation — Vault Path Resolution Summary

**vault-aware `resolveVaultPlanning()` added to vendored GSD engine; `planningDir/planningRoot` now resolve to `vault/projects/{name}/planning/` when `.cds/config.json` is present, with full backward-compatible fallback to `$PWD/.planning/`**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-18T11:30:00Z
- **Completed:** 2026-04-18T11:48:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `resolveVaultPlanning(cwd)` to `core.cjs` with vault discovery chain, `project-map.json` lookup, per-cwd cache, and path-traversal validation (T-51-01, T-51-02)
- Updated `planningDir()`, `planningRoot()`, and `findProjectRoot()` to route through vault when `.cds/config.json` is present
- Updated `gsd-tools.cjs` worktree resolution to skip when `.cds/config.json` exists (`cdsConfigExists` guard)
- Created `.cds/config.json` with `vault://planning` pointer and added `.planning/` to `.gitignore`

## Task Commits

1. **Task 1: Add resolveVaultPlanning() and update planningDir/planningPaths/planningRoot** - `7af6d18` (feat)
2. **Task 2: Create .cds/config.json and update .gitignore** - `b0d640c` (feat)

## Files Created/Modified

- `vendor/cds-workflow/bin/lib/core.cjs` - Added `resolveVaultPlanning()`, updated `planningDir()`, `planningRoot()`, `findProjectRoot()`, exported new function
- `vendor/cds-workflow/bin/gsd-tools.cjs` - Added `cdsConfigExists` guard in worktree root resolution block
- `.cds/config.json` - New file: `{ "planning": "vault://planning" }` committed to git
- `.gitignore` - Added `.planning/` entry under Phase 51 comment

## Decisions Made

- `resolveVaultPlanning()` returns `null` on every failure path (missing vault, missing project in map, parse error) rather than throwing — silent fallback keeps all existing GSD users unaffected
- Module-level `_vaultPlanningCache` Map caches result per cwd — avoids repeated fs reads on hot paths like `planningDir()` called many times per command
- Reused `BAD_SEGMENT = /[/\\]|\.\../` for project name validation from `project-map.json` — satisfies T-51-02 without introducing a new pattern
- `.cds/config.json` anchor added to `findProjectRoot()` before the `.planning/` ancestor walk — ensures projects with vault-based planning are still recognized as roots even without a local `.planning/` directory

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 52 (planning migration) can now rely on `resolveVaultPlanning()` to locate the vault destination
- Phase 53 (config system) can extend `.cds/config.json` schema — the current single-field format is intentionally minimal per D-10
- All existing GSD commands are backward-compatible: no `.cds/config.json` = no behavior change

---
*Phase: 51-planning-relocation*
*Completed: 2026-04-18*
