---
phase: 50-gsd-fork-vendor
plan: 02
subsystem: infra
tags: [vendoring, gsd, install-wizard, update-flow, patches-dissolved, cds-workflow]

# Dependency graph
requires:
  - 50-01 (vendor/cds-workflow/ tree)
provides:
  - lib/install/gsd.mjs — vendored install logic using cpSync from vendor/
  - lib/install/detect.mjs — detects both legacy get-shit-done and new cds-workflow paths
  - lib/update.mjs — update logic copies from vendor/ instead of npx
  - package.json — files array includes vendor/
  - hooks/gsd-auto-reapply-patches.sh — no-op (patches mechanism dissolved)
affects: [install-wizard, update-flow, cds-update-command]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "cpSync from vendor/cds-workflow/ to ~/.claude/cds-workflow/ (no upstream npm at install time)"
    - "VERSION file comparison for install-time up-to-date check (no package.json in vendor)"
    - "D-13 backward compat: detect both ~/.claude/get-shit-done and ~/.claude/cds-workflow"
    - "Agents copied to ~/.claude/agents/ (global), not inside ~/.claude/cds-workflow/agents/"

key-files:
  created: []
  modified:
    - lib/install/gsd.mjs
    - lib/install/detect.mjs
    - lib/update.mjs
    - package.json
    - hooks/gsd-auto-reapply-patches.sh
    - tests/pack-files-array.test.mjs
    - tests/install-gsd-patches.test.mjs
    - tests/gsd-auto-reapply-patches.test.mjs

key-decisions:
  - "applyShippedPatches() kept as no-op export for backward compat — dissolves patches without breaking callers"
  - "hasGsd detection changed from skills-dir scan to direct path check (cds-workflow OR get-shit-done)"
  - "Agents filtered to gsd-* prefix when copying to ~/.claude/agents/ (per Pitfall 2)"

requirements-completed: [GSD-01]

# Metrics
duration: ~10min
completed: 2026-04-18
---

# Phase 50 Plan 02: Install Wizard Rewrite + Patches Dissolution Summary

**CDS install wizard, update flow, and detection logic rewritten to use vendored vendor/cds-workflow/ via cpSync — zero calls to upstream npx get-shit-done-cc@latest; patches mechanism fully dissolved with no-op hook and updated test suite**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-04-18
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Rewrote `lib/install/gsd.mjs`: replaced `npx get-shit-done-cc@latest` with `cpSync` from `vendor/cds-workflow/`; VERSION file comparison for up-to-date check; agents copied to `~/.claude/agents/` (not inside cds-workflow/); `applyShippedPatches()` kept as no-op for backward compat
- Updated `lib/install/detect.mjs`: D-13 backward compat — detects both `~/.claude/get-shit-done` (legacy) and `~/.claude/cds-workflow` (new)
- Rewrote `lib/update.mjs` GSD section: `cpSync` from `vendor/cds-workflow/` + agents + skills; `hasGsd` detection changed to direct path check; label updated to "CDS workflow engine"
- Updated `package.json` files array: added `vendor/` so npm publish bundles the vendored engine
- Dissolved patches mechanism: `hooks/gsd-auto-reapply-patches.sh` is now a no-op `exit 0`
- Updated 3 test files: `pack-files-array.test.mjs` asserts `vendor/`; `install-gsd-patches.test.mjs` skips structural tests; `gsd-auto-reapply-patches.test.mjs` replaced with single no-op exit-0 assertion

## Task Commits

1. **Task 1: Rewrite install wizard, detect, and update modules** — `5206eda` (feat)
2. **Task 2: Dissolve patches mechanism and update tests** — `3b962db` (feat)

## Files Created/Modified

- `lib/install/gsd.mjs` — complete rewrite; cpSync from vendor/; no-op applyShippedPatches
- `lib/install/detect.mjs` — backward-compat dual-path detection
- `lib/update.mjs` — GSD update section replaced with cpSync from vendor/
- `package.json` — vendor/ added to files array
- `hooks/gsd-auto-reapply-patches.sh` — no-op (exit 0 with deprecation comment)
- `tests/pack-files-array.test.mjs` — added vendor/ assertion
- `tests/install-gsd-patches.test.mjs` — structural tests skipped; export tests pass
- `tests/gsd-auto-reapply-patches.test.mjs` — single no-op test replaces 5 old tests

## Decisions Made

- `applyShippedPatches()` kept as a named export (no-op returning `{ applied: [], skipped: [], failed: [] }`) rather than removed — ensures any code importing it doesn't break at runtime.
- `hasGsd` detection in `update.mjs` switched from scanning `~/.claude/skills/` for `gsd-*` dirs to a direct `existsSync` check on `~/.claude/cds-workflow` OR `~/.claude/get-shit-done`. The skills-dir scan was fragile and could miss installations where skills hadn't been copied.
- Agents filtered to `gsd-*` prefix when copying to `~/.claude/agents/` to avoid overwriting unrelated agents — per RESEARCH.md Pitfall 2.

## Deviations from Plan

None — plan executed exactly as written. All interfaces, replacement patterns, and test update strategies matched the spec.

## Issues Encountered

None.

## User Setup Required

None.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries. The install path change (npx → cpSync) strictly reduces the attack surface by eliminating a network call at install time.

## Self-Check: PASSED

- `lib/install/gsd.mjs` exists and contains `cds-workflow`
- `lib/install/detect.mjs` exists and contains `cds-workflow`
- `lib/update.mjs` exists and contains `cds-workflow`
- `package.json` `files` array includes `vendor/`
- `hooks/gsd-auto-reapply-patches.sh` exits 0 silently
- 3 test files pass: 10 passed, 6 skipped
- Commits `5206eda` and `3b962db` exist in git log

---
*Phase: 50-gsd-fork-vendor*
*Completed: 2026-04-18*
